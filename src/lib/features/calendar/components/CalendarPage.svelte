<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import {
		calendarDimensions,
		clearFiltersHref,
		filterEvents,
		filterHref,
		legendItems,
		readFilters,
		type FilterKey,
		type ShiftEvent
	} from '../calendar';
	import AgendaList from './AgendaList.svelte';
	import CalendarLegend from './CalendarLegend.svelte';
	import ShiftCalendar from './ShiftCalendar.svelte';
	import ShiftDialog from './ShiftDialog.svelte';

	let { events, url, today }: { events: ShiftEvent[]; url: URL; today?: Date } = $props();

	// Filters live in the URL (shareable) but filter in the browser: the page
	// already has every shift, so a filter change is a shallow URL update.
	// svelte-ignore state_referenced_locally
	let filters = $state(readFilters(url.searchParams));
	// svelte-ignore state_referenced_locally
	let href = $state(new URL(url));

	const visible = $derived(filterEvents(events, filters));
	const dimensions = $derived(calendarDimensions(events, filters));
	const legend = $derived(legendItems(events));
	const filtered = $derived(Object.values(filters).some((v) => v.length > 0));

	function go(next: string) {
		href = new URL(next, href);
		filters = readFilters(href.searchParams);
		try {
			replaceState(next, {});
		} catch {
			// Not inside a router (e.g. a fixture page during SSR); the local state still applies.
		}
	}

	// The library renders in the browser only (as before).
	let mounted = $state(false);
	onMount(() => (mounted = true));

	let selected = $state<any>(null);
	let dialogOpen = $state(false);
	function selectEvent(event: any) {
		selected = event;
		dialogOpen = true;
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<FilterBar
			{dimensions}
			on:change={(e) => go(filterHref(href, e.detail.key as FilterKey, e.detail.values))}
			on:clearAll={() => go(clearFiltersHref(href))}
		/>
		<p class="shrink-0 text-sm text-muted-foreground" aria-live="polite">
			{filtered ? `${visible.length} of ${events.length} shifts` : `${events.length} shift${events.length === 1 ? '' : 's'}`}
		</p>
	</div>
	<CalendarLegend items={legend} />

	<div class="hidden rounded-lg border bg-card p-4 shadow-card md:block">
		{#if mounted}
			<ShiftCalendar events={visible} {selectEvent} />
		{:else}
			<div class="h-[640px] animate-pulse rounded-md bg-muted" aria-label="Loading calendar"></div>
		{/if}
	</div>
	<div class="md:hidden">
		<AgendaList events={visible} onselect={selectEvent} {today} />
	</div>
</div>

<ShiftDialog bind:open={dialogOpen} event={selected} />
