---
pageClass: 'rule-details'
sidebarDepth: 0
title: 'svelte/@typescript-eslint/no-useless-default-assignment'
description: 'disallow default values that will never be used'
---

# svelte/@typescript-eslint/no-useless-default-assignment

> disallow default values that will never be used

- :exclamation: <badge text="This rule has not been released yet." vertical="middle" type="error"> **_This rule has not been released yet._** </badge>
- :wrench: The `--fix` option on the [command line](https://eslint.org/docs/user-guide/command-line-interface#fixing-problems) can automatically fix some of the problems reported by this rule.

## :book: Rule Details

This rule extends the base `@typescript-eslint`'s [@typescript-eslint/no-useless-default-assignment] rule.
The [@typescript-eslint/no-useless-default-assignment] rule does not understand Svelte 5's `$props()` and `$bindable()` runes, and reports false positives on bindable props and on props with default values that have a non-optional declared type. This rule understands those Svelte runes.

In Svelte 5, props can be omitted by the parent component, in which case the destructuring default is used at runtime — even when the declared type does not include `undefined`. Defaults to `$bindable(...)` are also valid Svelte 5 syntax for declaring a bindable prop with a default value.

<!--eslint-skip-->

```svelte
<script lang="ts">
  /* eslint svelte/@typescript-eslint/no-useless-default-assignment: "error" */
  interface Props {
    count: number;
    label: string;
    value: number;
  }
  /* ✓ GOOD */
  let { count = 0, label = 'hello', value = $bindable(0) }: Props = $props();
</script>
```

## :wrench: Options

```json
{
  "@typescript-eslint/no-useless-default-assignment": "off",
  "svelte/@typescript-eslint/no-useless-default-assignment": [
    "error",
    {
      "allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing": false
    }
  ]
}
```

Same as [@typescript-eslint/no-useless-default-assignment] rule option. See [here](https://typescript-eslint.io/rules/no-useless-default-assignment/#options) for details.

## :couple: Related rules

- [@typescript-eslint/no-useless-default-assignment]

[@typescript-eslint/no-useless-default-assignment]: https://typescript-eslint.io/rules/no-useless-default-assignment/

## :mag: Implementation

- [Rule source](https://github.com/sveltejs/eslint-plugin-svelte/blob/main/packages/eslint-plugin-svelte/src/rules/@typescript-eslint/no-useless-default-assignment.ts)
- [Test source](https://github.com/sveltejs/eslint-plugin-svelte/blob/main/packages/eslint-plugin-svelte/tests/src/rules/@typescript-eslint/no-useless-default-assignment.ts)

<sup>Taken with ❤️ [from @typescript-eslint/eslint-plugin](https://typescript-eslint.io/rules/no-useless-default-assignment/)</sup>
