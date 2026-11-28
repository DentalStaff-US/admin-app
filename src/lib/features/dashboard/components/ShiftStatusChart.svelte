<script lang="ts">
	// Shifts per week split by status: the last 8 weeks and the 4 ahead (dimmed).
	// Status colours are the status tones (02); the legend carries the labels.
	import Section from '$dtss/Section.svelte';
	import { cn } from '$lib/utils';
	import type { StatusPoint, ShiftStatus } from '../trends';
	import ColumnChart, { type Column } from './ColumnChart.svelte';

	let { points }: { points: StatusPoint[] } = $props();

	const SERIES: { key: ShiftStatus; label: string; fill: string; swatch: string }[] = [
		{ key: 'FILLED', label: 'Filled', fill: 'fill-status-positive-solid', swatch: 'bg-status-positive-solid' },
		{ key: 'OPEN', label: 'Open', fill: 'fill-status-pending-solid', swatch: 'bg-status-pending-solid' },
		{ key: 'UNFULFILLED', label: 'Unfulfilled', fill: 'fill-status-negative-solid', swatch: 'bg-status-negative-solid' },
		{ key: 'CANCELED', label: 'Canceled', fill: 'fill-status-neutral-solid', swatch: 'bg-status-neutral-solid' }
	];

	const columns = $derived<Column[]>(
		points.map((p) => ({
			key: p.week,
			label: p.label,
			dim: p.future,
			segments: SERIES.map((s) => ({ key: s.key, label: s.label, value: p[s.key], fill: s.fill, swatch: s.swatch }))
		}))
	);
</script>

<Section title="Shifts by status" description="Per week by shift date: the last 8 weeks, and the 4 ahead (lighter).">
	{#snippet actions()}<a href="/calendar" class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all on the calendar">View all</a>{/snippet}
	<ColumnChart {columns} label="Shifts by status per week" />
	<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
		{#each SERIES as s (s.key)}
			<li class="flex items-center gap-1.5"><span class={cn('size-2.5 rounded-sm', s.swatch)}></span>{s.label}</li>
		{/each}
	</ul>
</Section>
