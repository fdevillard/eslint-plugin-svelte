---
'eslint-plugin-svelte': minor
---

feat: add `svelte/@typescript-eslint/no-useless-default-assignment` rule

Adds a Svelte-aware extension of the upstream
[`@typescript-eslint/no-useless-default-assignment`](https://typescript-eslint.io/rules/no-useless-default-assignment/)
rule that does not report false positives for default values on Svelte 5
`$props()` destructuring or `$bindable()` defaults.
