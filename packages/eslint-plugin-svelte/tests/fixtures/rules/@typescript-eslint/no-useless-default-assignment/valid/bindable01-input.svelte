<script lang="ts">
	interface Props {
		value: number;
		count: number;
	}
	// `$bindable(...)` is the canonical way to declare a bindable prop with a
	// default value in Svelte 5, so the rule must not flag it.
	let { value = $bindable(0), count = $bindable() }: Props = $props();
</script>

<input bind:value />
<span>{count}</span>
