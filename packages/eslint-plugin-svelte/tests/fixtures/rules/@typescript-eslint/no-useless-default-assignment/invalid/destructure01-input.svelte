<script lang="ts">
	const obj: { foo: string } = { foo: 'bar' };
	// Destructuring from a non-`$props()` source still triggers the rule.
	const { foo = 'baz' } = obj;
</script>

<div>{foo}</div>
