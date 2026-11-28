<script lang="ts">
	// Needs attention / Waiting on you (10 §3.1, §4.1). Chips filter client-side and
	// the URL carries the choice (?attention=billing). At most 10 rows, then
	// "Show N more" in place; the full sets live on each kind's list page.
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowRight, CheckCircle2 } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { cn } from '$lib/utils';
	import { buildAttentionQueue, KIND_META, limitRows, parseAttentionFilter, type AttentionFilter } from '../attention';
	import type { AttentionGroup } from '../types';
	import AttentionItemRow from './AttentionItemRow.svelte';
	import FailedLine from './FailedLine.svelte';

	let {
		groups,
		title = 'Needs attention',
		emptyTitle = 'Nothing needs you right now',
		emptyDescription,
		showLocation = true,
		now = new Date(),
		syncUrl = true
	}: {
		groups: AttentionGroup[];
		title?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		showLocation?: boolean;
		now?: Date;
		/** Off in fixtures, where there's no router. */
		syncUrl?: boolean;
	} = $props();

	let filter = $state<AttentionFilter>(parseAttentionFilter(page.url?.searchParams.get('attention')));
	let expanded = $state(false);
	let mounted = $state(false);
	const removed = new SvelteSet<string>();
	onMount(() => (mounted = true));

	const queue = $derived(buildAttentionQueue(groups, filter, removed));
	const rows = $derived(limitRows(queue.items, expanded));
	const checked = $derived(groups.length);

	// A chip whose category emptied (approved the last one) falls back to All.
	$effect(() => {
		if (filter !== 'all' && !queue.chips.some((c) => c.value === filter)) filter = 'all';
	});

	function choose(value: AttentionFilter) {
		filter = value;
		expanded = false;
		if (!syncUrl || !mounted) return;
		const url = new URL(page.url);
		if (value === 'all') url.searchParams.delete('attention');
		else url.searchParams.set('attention', value);
		replaceState(url, page.state);
	}

	const failedNames = $derived(queue.failedKinds.map((k) => KIND_META[k].noun).join(', '));
</script>

<section class="overflow-hidden rounded-lg border bg-card shadow-card" aria-labelledby="attention-title">
	<header class="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
		<h2 id="attention-title" class="text-h3">
			{title}
			{#if queue.total > 0}<span class="ml-1 tabular-nums text-muted-foreground">({queue.total})</span>{/if}
		</h2>
		{#if queue.chips.length > 2}
			<div role="radiogroup" aria-label="Filter by category" class="-mx-1 flex gap-1 overflow-x-auto px-1">
				{#each queue.chips as chip (chip.value)}
					<button
						type="button"
						role="radio"
						aria-checked={filter === chip.value}
						onclick={() => choose(chip.value)}
						class={cn(
							'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							filter === chip.value && 'border-primary bg-primary-soft text-foreground'
						)}
					>
						{chip.label}
						<span class="tabular-nums text-xs">{chip.count}</span>
					</button>
				{/each}
			</div>
		{/if}
	</header>

	{#if queue.failedKinds.length}
		<div class="px-5 pt-4 sm:px-6"><FailedLine what={failedNames} /></div>
	{/if}

	{#if queue.allClear}
		<div class="p-5 sm:p-6">
			<EmptyState
				icon={CheckCircle2}
				title={emptyTitle}
				description={emptyDescription ?? `Nothing waiting · ${checked} ${checked === 1 ? 'category' : 'categories'} clear`}
			/>
		</div>
	{:else if queue.items.length}
		<ul class="divide-y">
			{#each rows.shown as item (item.id)}
				<AttentionItemRow
					{item}
					{showLocation}
					{now}
					onremove={(id) => removed.add(id)}
					onrestore={(id) => removed.delete(id)}
				/>
			{/each}
		</ul>
		{#if rows.hidden || queue.overflow.length}
			<footer class="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-5 py-3 text-sm sm:px-6">
				{#if rows.hidden}
					<button type="button" class="font-semibold text-primary-dark hover:underline" onclick={() => (expanded = true)}>
						Show {rows.hidden} more
					</button>
				{/if}
				{#each queue.overflow as o (o.kind)}
					{#if o.href}
						<a href={o.href} class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
							See all {o.count} {o.noun}<ArrowRight class="size-3.5" aria-hidden="true" />
						</a>
					{/if}
				{/each}
			</footer>
		{/if}
	{/if}
</section>
