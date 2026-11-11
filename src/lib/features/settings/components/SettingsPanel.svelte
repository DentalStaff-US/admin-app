<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		actions,
		children
	}: { title: string; description?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<!-- One settings section: an h2 at text-h2 (06 › Settings) over its section cards. -->
<div class="space-y-6">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h2 class="text-h2">{title}</h2>
			{#if description}<p class="mt-1 text-sm text-muted-foreground">{description}</p>{/if}
		</div>
		{#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
	</header>
	{@render children()}
</div>
