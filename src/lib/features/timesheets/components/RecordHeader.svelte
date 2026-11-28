<script lang="ts">
	/**
	 * PageHeader (03 › Page & PageHeader) with the meta row a detail page needs
	 * (status, IDs, due date) and a back link. The shared $dtss/PageHeader has
	 * no `meta` snippet yet; once it does, this can go.
	 */
	import type { Snippet } from 'svelte';
	import { ArrowLeft } from 'lucide-svelte';

	let {
		title,
		description,
		back,
		meta,
		actions
	}: {
		title: string;
		description?: string;
		back?: { href: string; label: string };
		meta?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
	<div class="min-w-0">
		{#if back}
			<a href={back.href} class="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
				<ArrowLeft class="size-4" aria-hidden="true" />
				{back.label}
			</a>
		{/if}
		<h1 class="text-h1">{title}</h1>
		{#if description}<p class="mt-1 max-w-2xl text-muted-foreground">{description}</p>{/if}
		{#if meta}<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{@render meta()}</div>{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{@render actions()}</div>
	{/if}
</header>
