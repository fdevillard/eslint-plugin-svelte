<script lang="ts">
	// Default values for optional properties remain valid (no false positive).
	let { count = 0 }: { count?: number } = $props();
</script>

<div>{count}</div>
