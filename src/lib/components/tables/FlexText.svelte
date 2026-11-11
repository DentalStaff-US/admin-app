<script lang="ts">
	// Plain-text cell for svelte-table.ts's flexRender. Temporary with it.
	let { content }: { content: unknown } = $props();
</script>

{content ?? ''}
