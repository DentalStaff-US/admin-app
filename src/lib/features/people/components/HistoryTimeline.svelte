<script lang="ts">
	import { History } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Timeline from '$dtss/Timeline.svelte';
	import { ACTION_LABELS, ENTITY_LABELS } from '$lib/audit/constants';
	import { ledgerToTimeline } from '../people';

	/** The record's slice of action_history, on the shared Timeline (03 › Timeline). */
	let {
		entries = [],
		emptyTitle = 'No history yet',
		emptyDescription = 'Changes and views are recorded here as they happen.'
	}: {
		entries: Parameters<typeof ledgerToTimeline>[0];
		emptyTitle?: string;
		emptyDescription?: string;
	} = $props();

	const timeline = $derived(ledgerToTimeline(entries, { action: ACTION_LABELS, entity: ENTITY_LABELS }));
</script>

{#if timeline.length === 0}
	<EmptyState icon={History} title={emptyTitle} description={emptyDescription} />
{:else}
	<Timeline entries={timeline} />
{/if}
