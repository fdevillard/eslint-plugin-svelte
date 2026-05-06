// This rule wraps typescript-eslint's `no-useless-default-assignment` rule and
// adds Svelte-specific bypasses for the `$props()` and `$bindable()` runes.
// https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/src/rules/no-useless-default-assignment.ts
import type { TSESTree } from '@typescript-eslint/types';
import { createRule } from '../../utils/index.js';
import type { RuleContext, RuleListener } from '../../types.js';
import { loadModule } from '../../utils/load-module.js';
import { getTypeScriptTools } from '../../utils/ts-utils/index.js';

// `@typescript-eslint/eslint-plugin` exposes individual rule modules through
// this entry point so that downstream packages can wrap them. We deliberately
// load it lazily — it is *not* declared as a dependency of this plugin, so the
// rule degrades gracefully when the package is not installed.
const UPSTREAM_RULES_ENTRY = '@typescript-eslint/eslint-plugin/use-at-your-own-risk/rules';
const UPSTREAM_RULE_NAME = 'no-useless-default-assignment';

type UpstreamRule = {
	create(context: RuleContext): RuleListener;
};

type UpstreamRulesIndex = Record<string, UpstreamRule | undefined>;

function loadUpstreamRule(context: RuleContext): UpstreamRule | null {
	const rules = loadModule<UpstreamRulesIndex>(context, UPSTREAM_RULES_ENTRY);
	return rules?.[UPSTREAM_RULE_NAME] ?? null;
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
 * whose source is a `$props()` call — Svelte 5 props can be omitted by the
 * parent component, so the destructuring default is meaningful even when
 * the declared type does not include `undefined`.
 */
function isInsidePropsDestructuring(node: TSESTree.AssignmentPattern): boolean {
	const declarator = findVariableDeclaratorSource(node);
	return declarator != null && isRuneCall(declarator.init, '$props');
}

/**
 * Returns true if the default value expression is a `$bindable(...)` rune call.
 * `$bindable` is the canonical Svelte 5 way to declare a bindable prop with a
 * default value, so the rule must not flag it.
 */
function isBindableDefault(expr: TSESTree.Node): boolean {
	return isRuneCall(expr, '$bindable');
}

export default createRule(`@typescript-eslint/${UPSTREAM_RULE_NAME}`, {
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
		// Mirror the upstream messageIds so that `context.report({ messageId })`
		// calls made by the wrapped rule resolve correctly under our rule meta.
		messages: {
			missingPlugin:
				'`svelte/@typescript-eslint/no-useless-default-assignment` requires `@typescript-eslint/eslint-plugin` (>= 8.50) to be installed.',
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
		// The upstream rule requires full TypeScript type information; bail out
		// silently when it is unavailable so the rule can be enabled in shared
		// configs without forcing every consumer to set up typed linting.
		if (!getTypeScriptTools(context)) {
			return {};
		}

		const upstreamRule = loadUpstreamRule(context);
		if (!upstreamRule) {
			context.report({
				loc: {
					start: { line: 0, column: 0 },
					end: { line: 0, column: 0 }
				},
				messageId: 'missingPlugin'
			});
			return {};
		}

		const handlers = upstreamRule.create(context) as RuleListener & {
			AssignmentPattern?: (node: TSESTree.AssignmentPattern) => void;
		};
		const upstreamAssignmentPattern = handlers.AssignmentPattern;

		return {
			...handlers,
			AssignmentPattern(node: TSESTree.AssignmentPattern) {
				if (isBindableDefault(node.right)) return;
				if (isInsidePropsDestructuring(node)) return;
				upstreamAssignmentPattern?.(node);
			}
		};
	}
});
