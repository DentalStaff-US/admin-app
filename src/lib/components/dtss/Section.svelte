<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let {
		title,
		description,
		actions,
		flush = false,
		class: className,
		children
	}: {
		title?: string;
		description?: string;
		actions?: Snippet;
		/** No body padding: for tables and divide-y lists that run edge to edge. */
		flush?: boolean;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<!-- 03 › Card: the section card for settings groups and detail-page sections. -->
<section class={cn('overflow-hidden rounded-lg border bg-card text-card-foreground shadow-card', className)}>
	{#if title || actions}
		<header class="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
			<div class="min-w-0">
				{#if title}<h2 class="text-h3">{title}</h2>{/if}
				{#if description}<p class="mt-0.5 text-sm text-muted-foreground">{description}</p>{/if}
			</div>
			{#if actions}<div class="flex flex-wrap gap-2">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class={cn(!flush && 'px-5 py-4 sm:px-6 sm:py-5')}>{@render children()}</div>
</section>
