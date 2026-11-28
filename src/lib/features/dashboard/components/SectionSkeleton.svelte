<script lang="ts">
	// Streaming placeholder in the content's shape (03 › Loading & skeletons).
	let { rows = 3, tiles = 0, label }: { rows?: number; tiles?: number; label: string } = $props();
</script>

<div class="rounded-lg border bg-card p-5 shadow-card" aria-busy="true" aria-label="Loading {label}">
	{#if tiles}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each Array(tiles) as _, i (i)}
				<div class="h-28 animate-pulse rounded-md bg-muted"></div>
			{/each}
		</div>
	{:else}
		<div class="h-5 w-40 animate-pulse rounded-md bg-muted"></div>
		<div class="mt-4 space-y-2">
			{#each Array(rows) as _, i (i)}
				<div class="h-9 animate-pulse rounded-md bg-muted"></div>
			{/each}
		</div>
	{/if}
</div>
