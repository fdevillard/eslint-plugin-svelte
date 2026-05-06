import { RuleTester } from '../../../utils/eslint-compat.js';
import rule from '../../../../src/rules/@typescript-eslint/no-useless-default-assignment.js';
import { loadTestCases, RULES_PROJECT } from '../../../utils/utils.js';

const tester = new RuleTester({
	languageOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
		parserOptions: {
			parser: {
				ts: '@typescript-eslint/parser',
				js: 'espree'
			},
			project: RULES_PROJECT,
			disallowAutomaticSingleRunInference: true
		}
	}
});

tester.run(
	'@typescript-eslint/no-useless-default-assignment',
	rule as any,
	loadTestCases('@typescript-eslint/no-useless-default-assignment')
);
