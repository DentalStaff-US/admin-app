<script lang="ts">
	/**
	 * The audit trail as a Timeline (03 › Timeline). Given ledger rows (admin),
	 * views are hidden behind a toggle; given derived entries (practice), they
	 * render as-is. Shared by timesheets and invoices.
	 */
	import type { Snippet } from 'svelte';
	import type { ActivityEntry } from '$lib/audit/constants';
	import Section from '$dtss/Section.svelte';
	import Timeline from '$dtss/Timeline.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { auditToTimeline, countViews, type HistoryEntry } from '../history';

	let {
		title = 'History',
		description,
		audit,
		entries,
		empty = 'Nothing has happened yet.',
		before
	}: {
		title?: string;
		description?: string;
		audit?: ActivityEntry[] | null;
		entries?: HistoryEntry[];
		empty?: string;
		/** Shown above the timeline, e.g. a comment form. */
		before?: Snippet;
	} = $props();

	let includeViews = $state(false);
	const views = $derived(audit ? countViews(audit) : 0);
	const shown = $derived(audit ? auditToTimeline(audit, { includeViews }) : (entries ?? []));
</script>

{#snippet toggle()}
	{#if views > 0}
		<div class="flex items-center gap-2">
			<Switch id="history-views" bind:checked={includeViews} />
			<Label for="history-views" class="text-sm font-normal text-muted-foreground">Show views ({views})</Label>
		</div>
	{/if}
{/snippet}

<Section {title} {description} actions={audit ? toggle : undefined}>
	{@render before?.()}
	<Timeline entries={shown} {empty} />
</Section>
