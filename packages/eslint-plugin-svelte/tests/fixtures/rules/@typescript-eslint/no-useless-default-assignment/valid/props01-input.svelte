<script lang="ts">
	interface Props {
		count: number;
		label: string;
	}
	// Svelte 5 props can be omitted by the parent component, so the default
	// value is meaningful even when the declared type is not optional.
	let { count = 0, label = 'hello' }: Props = $props();
</script>

<div>{count} {label}</div>
