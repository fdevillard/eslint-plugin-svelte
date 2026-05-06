<script lang="ts">
	// Outside of `$props()` destructuring the rule still applies as in upstream.
	function greet({ name }: { name: string }) {
		return `hello ${name}`;
	}

	const result = greet({ name: 'svelte' });
</script>

<div>{result}</div>
