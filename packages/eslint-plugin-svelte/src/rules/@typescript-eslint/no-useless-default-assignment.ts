// This rule is based on typescript-eslint's no-useless-default-assignment rule
// and modified to work well with Svelte components.
// https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/src/rules/no-useless-default-assignment.ts
import type { TSESTree } from '@typescript-eslint/types';
import { createRule } from '../../utils/index.js';
import type { RuleFixer } from '../../types.js';
import {
	getTypeScriptTools,
	isAnyType,
	isTupleType,
	isUndefinedType,
	isUnknownType
} from '../../utils/ts-utils/index.js';
import type { TS, TSTools, TypeScript } from '../../utils/ts-utils/index.js';

/**
 * Returns all parts of a union type or `[type]` if it's not a union.
 */
function unionTypeParts(type: TS.Type): TS.Type[] {
	return type.isUnion() ? type.types.flatMap(unionTypeParts) : [type];
}

/**
 * Check whether the given type can be `undefined`.
 */
function canBeUndefined(type: TS.Type, tools: TSTools): boolean {
	const { ts } = tools;
	if (isAnyType(type, ts) || isUnknownType(type, ts)) {
		return true;
	}
	return unionTypeParts(type).some((part) => isUndefinedType(part, ts));
}

/**
 * Check whether a type is a TypeScript type parameter (a generic).
 */
function isTypeParameter(type: TS.Type, ts: TypeScript): boolean {
	return (type.flags & ts.TypeFlags.TypeParameter) !== 0;
}

/**
 * Check whether the given symbol has the optional flag set.
 */
function isSymbolOptional(symbol: TS.Symbol, ts: TypeScript): boolean {
	return (symbol.flags & ts.SymbolFlags.Optional) !== 0;
}

/**
 * Walks up the destructuring chain from a node and returns the topmost
 * `VariableDeclarator` whose initializer is the source of the destructuring,
 * or `null` if the destructuring is part of a function parameter or other
 * non-`VariableDeclarator` context.
 */
function findVariableDeclaratorSource(node: TSESTree.Node): TSESTree.VariableDeclarator | null {
	let current: TSESTree.Node | undefined = node.parent;
	while (current) {
		if (current.type === 'VariableDeclarator') {
			return current;
		}
		if (
			current.type === 'Property' ||
			current.type === 'ObjectPattern' ||
			current.type === 'ArrayPattern' ||
			current.type === 'AssignmentPattern' ||
			current.type === 'RestElement'
		) {
			current = current.parent;
			continue;
		}
		return null;
	}
	return null;
}

/**
 * Check whether the given expression is a call to a Svelte rune with the given name.
 */
function isRuneCall(
	expr: TSESTree.Node | null | undefined,
	runeName: string
): expr is TSESTree.CallExpression {
	return (
		expr != null &&
		expr.type === 'CallExpression' &&
		expr.callee.type === 'Identifier' &&
		expr.callee.name === runeName
	);
}

/**
 * Returns true if the given assignment pattern is part of a destructuring
 * whose source is a `$props()` call (i.e. a Svelte 5 component prop).
 *
 * In Svelte 5, props can be omitted by the parent component, in which case
 * the destructuring default is used at runtime — even though the declared
 * type may not include `undefined`.
 */
function isInsidePropsDestructuring(node: TSESTree.AssignmentPattern): boolean {
	const declarator = findVariableDeclaratorSource(node);
	return declarator != null && isRuneCall(declarator.init, '$props');
}

/**
 * Returns true if the default value expression is a `$bindable(...)` rune call.
 */
function isBindableDefault(expr: TSESTree.Node): boolean {
	return isRuneCall(expr, '$bindable');
}

export default createRule('@typescript-eslint/no-useless-default-assignment', {
	meta: {
		docs: {
			description: 'disallow default values that will never be used',
			category: 'Extension Rules',
			recommended: false,
			extensionRule: {
				plugin: '@typescript-eslint/eslint-plugin',
				url: 'https://typescript-eslint.io/rules/no-useless-default-assignment/'
			}
		},
		schema: [
			{
				type: 'object',
				additionalProperties: false,
				properties: {
					allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing: {
						description:
							'Whether to not error when running with a tsconfig that has strictNullChecks turned off.',
						type: 'boolean'
					}
				}
			}
		],
		fixable: 'code',
		messages: {
			noStrictNullCheck:
				'This rule requires the `strictNullChecks` compiler option to be turned on to function correctly.',
			preferOptionalSyntax:
				'Using `= undefined` to make a parameter optional adds unnecessary runtime logic. Use the `?` optional syntax instead.',
			uselessDefaultAssignment: 'Default value is useless because the {{ type }} is not optional.',
			uselessUndefined:
				'Default value is useless because it is undefined. Optional {{ type }}s are already undefined by default.'
		},
		type: 'suggestion'
	},
	create(context) {
		const { allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing = false } = (context
			.options[0] || {}) as {
			allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing?: boolean;
		};
		const tools = getTypeScriptTools(context);
		if (!tools) {
			return {};
		}
		const { service, ts } = tools;
		const checker = service.program.getTypeChecker();
		const compilerOptions = service.program.getCompilerOptions();
		const isStrictNullChecks = compilerOptions.strict
			? compilerOptions.strictNullChecks !== false
			: compilerOptions.strictNullChecks;

		if (!isStrictNullChecks && allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing !== true) {
			context.report({
				loc: {
					start: { line: 0, column: 0 },
					end: { line: 0, column: 0 }
				},
				messageId: 'noStrictNullCheck'
			});
		}

		function getArrayElementType(arrayType: TS.Type, elementIndex: number): TS.Type | null {
			if (isTupleType(arrayType, ts)) {
				const tupleArgs = checker.getTypeArguments(arrayType as TS.TypeReference);
				if (elementIndex < tupleArgs.length) {
					return tupleArgs[elementIndex];
				}
			}
			return arrayType.getNumberIndexType() ?? null;
		}

		function getPropertyName(key: TSESTree.Expression | TSESTree.PrivateIdentifier): string | null {
			switch (key.type) {
				case 'Identifier':
					return key.name;
				case 'Literal':
					return String(key.value);
				case 'TemplateLiteral':
					return key.expressions.length ? null : key.quasis[0].value.cooked;
				default:
					return null;
			}
		}

		function hasPropertyInAllBranches(
			expression: TSESTree.Expression,
			propertyName: string
		): boolean {
			return (
				(expression.type === 'ObjectExpression' &&
					expression.properties.some(
						(prop: TSESTree.Property | TSESTree.SpreadElement) =>
							prop.type === 'Property' && getPropertyName(prop.key) === propertyName
					)) ||
				(expression.type === 'ConditionalExpression' &&
					hasPropertyInAllBranches(expression.consequent, propertyName) &&
					hasPropertyInAllBranches(expression.alternate, propertyName))
			);
		}

		function hasConditionalInitializer(node: TSESTree.Node): boolean {
			const parent = node.parent;
			if (!parent) {
				return false;
			}
			if (parent.type === 'VariableDeclarator' && parent.init) {
				return (
					parent.init.type === 'ConditionalExpression' || parent.init.type === 'LogicalExpression'
				);
			}
			return hasConditionalInitializer(parent);
		}

		function getSourceTypeForPattern(pattern: TSESTree.Node): TS.Type | null {
			const parent = pattern.parent;
			if (!parent) return null;

			if (parent.type === 'VariableDeclarator' && parent.init) {
				const tsNode = service.esTreeNodeToTSNodeMap.get(parent.init);
				return tsNode ? checker.getTypeAtLocation(tsNode) : null;
			}

			if (
				parent.type === 'FunctionDeclaration' ||
				parent.type === 'FunctionExpression' ||
				parent.type === 'ArrowFunctionExpression'
			) {
				let paramIndex = parent.params.indexOf(pattern as TSESTree.Parameter);
				const tsFunc = service.esTreeNodeToTSNodeMap.get(parent);
				if (!tsFunc || !ts.isFunctionLike(tsFunc)) return null;
				const signature = checker.getSignatureFromDeclaration(tsFunc);
				if (!signature) return null;
				const params = signature.getParameters();
				if (signature.thisParameter) {
					paramIndex--;
				}
				if (paramIndex < 0 || paramIndex >= params.length) {
					return null;
				}
				return checker.getTypeOfSymbol(params[paramIndex]);
			}

			if (parent.type === 'AssignmentPattern') {
				return getSourceTypeForPattern(parent);
			}

			if (parent.type === 'Property') {
				return getTypeOfProperty(parent);
			}

			if (parent.type === 'ArrayPattern') {
				const arrayType = getSourceTypeForPattern(parent);
				if (!arrayType) return null;
				const elementIndex = parent.elements.indexOf(pattern as TSESTree.DestructuringPattern);
				return getArrayElementType(arrayType, elementIndex);
			}

			return null;
		}

		function getTypeOfProperty(node: TSESTree.Property): TS.Type | null {
			const objectPattern = node.parent as TSESTree.ObjectPattern;
			const sourceType = getSourceTypeForPattern(objectPattern);
			if (!sourceType) return null;

			const propertyName = getPropertyName(node.key);
			if (!propertyName) return null;

			const symbol = sourceType.getProperty(propertyName);
			if (!symbol) return null;

			if (isSymbolOptional(symbol, ts)) {
				const parent = objectPattern.parent;
				if (
					parent &&
					parent.type === 'VariableDeclarator' &&
					parent.init &&
					hasConditionalInitializer(objectPattern)
				) {
					if (!hasPropertyInAllBranches(parent.init, propertyName)) {
						return null;
					}
				}
			}

			return checker.getTypeOfSymbol(symbol);
		}

		function removeDefault(fixer: RuleFixer, node: TSESTree.AssignmentPattern) {
			const start = node.left.range[1];
			const end = node.range[1];
			return fixer.removeRange([start, end]);
		}

		function reportUselessDefaultAssignment(
			node: TSESTree.AssignmentPattern,
			type: 'parameter' | 'property'
		): void {
			context.report({
				node: node.right,
				messageId: 'uselessDefaultAssignment',
				data: { type },
				fix: (fixer) => removeDefault(fixer, node)
			});
		}

		function reportUselessUndefined(
			node: TSESTree.AssignmentPattern,
			type: 'parameter' | 'property'
		): void {
			context.report({
				node: node.right,
				messageId: 'uselessUndefined',
				data: { type },
				fix: (fixer) => removeDefault(fixer, node)
			});
		}

		function reportPreferOptionalSyntax(node: TSESTree.AssignmentPattern): void {
			context.report({
				node: node.right,
				messageId: 'preferOptionalSyntax',
				*fix(fixer) {
					yield removeDefault(fixer, node);
					const { left } = node;
					if (left.type === 'Identifier') {
						yield fixer.insertTextAfterRange(
							[left.range[0], left.range[0] + left.name.length],
							'?'
						);
					}
				}
			});
		}

		function checkAssignmentPattern(node: TSESTree.AssignmentPattern): void {
			// Skip when the default value is the Svelte `$bindable(...)` rune.
			// `$bindable` is the canonical way to declare bindable props with a
			// default value in Svelte 5, even when the declared type is not optional.
			if (isBindableDefault(node.right)) {
				return;
			}

			// Skip when this destructuring pattern is part of a `$props()` call.
			// Svelte 5 props may be omitted by the parent component, so the default
			// is meaningful even when the type does not include `undefined`.
			if (isInsidePropsDestructuring(node)) {
				return;
			}

			if (node.right.type === 'Identifier' && node.right.name === 'undefined') {
				const tsNode = service.esTreeNodeToTSNodeMap.get(node);
				if (
					tsNode &&
					ts.isParameter(tsNode) &&
					tsNode.type &&
					canBeUndefined(checker.getTypeFromTypeNode(tsNode.type), tools!)
				) {
					reportPreferOptionalSyntax(node);
					return;
				}

				const type =
					node.parent && (node.parent.type === 'Property' || node.parent.type === 'ArrayPattern')
						? 'property'
						: 'parameter';
				reportUselessUndefined(node, type);
				return;
			}

			const parent = node.parent;
			if (!parent) return;

			if (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
				const paramIndex = parent.params.indexOf(node);
				if (paramIndex !== -1) {
					const tsFunc = service.esTreeNodeToTSNodeMap.get(parent);
					if (tsFunc && ts.isFunctionLike(tsFunc)) {
						const contextualType = checker.getContextualType(tsFunc as unknown as TS.Expression);
						if (!contextualType) {
							return;
						}
						const signatures = contextualType.getCallSignatures();
						if (signatures.length === 0 || signatures[0].getDeclaration() === tsFunc) {
							return;
						}
						const params = signatures[0].getParameters();
						if (paramIndex < params.length) {
							const paramSymbol = params[paramIndex];
							if (
								paramSymbol.valueDeclaration &&
								ts.isParameter(paramSymbol.valueDeclaration) &&
								paramSymbol.valueDeclaration.dotDotDotToken != null
							) {
								return;
							}
							if (!isSymbolOptional(paramSymbol, ts)) {
								const paramType = checker.getTypeOfSymbol(paramSymbol);
								if (!isTypeParameter(paramType, ts) && !canBeUndefined(paramType, tools!)) {
									reportUselessDefaultAssignment(node, 'parameter');
								}
							}
						}
					}
				}
				return;
			}

			if (parent.type === 'Property') {
				const propertyType = getTypeOfProperty(parent);
				if (!propertyType) {
					return;
				}
				if (!canBeUndefined(propertyType, tools!)) {
					reportUselessDefaultAssignment(node, 'property');
				}
			} else if (parent.type === 'ArrayPattern') {
				const sourceType = getSourceTypeForPattern(parent);
				if (!sourceType) {
					return;
				}
				if (!isTupleType(sourceType, ts)) {
					return;
				}
				const tupleArgs = checker.getTypeArguments(sourceType as TS.TypeReference);
				const elementIndex = parent.elements.indexOf(node);
				if (elementIndex < 0 || elementIndex >= tupleArgs.length) {
					return;
				}
				const elementType = tupleArgs[elementIndex];
				if (!canBeUndefined(elementType, tools!)) {
					reportUselessDefaultAssignment(node, 'property');
				}
			}
		}

		return {
			AssignmentPattern: checkAssignmentPattern
		};
	}
});
