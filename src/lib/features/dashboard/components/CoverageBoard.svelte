<script lang="ts">
	// Coverage, next 7 days (10 §3.2): locations × days on plain CSS grid; a
	// per-day list on phones. Rows with the most gaps come first.
	import { CalendarCheck } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import { cn } from '$lib/utils';
	import { buildCoverage, coverageByDay, type CoverageCell as Cell, type CoverageRow } from '../coverage';
	import { formatDateOnly } from '../format';
	import type { CoverageShift, Metric } from '../types';
	import CoverageCell from './CoverageCell.svelte';
	import CoverageDaySheet from './CoverageDaySheet.svelte';
	import FailedLine from './FailedLine.svelte';

	let { shifts, days }: { shifts: Metric<CoverageShift[]>; days: string[] } = $props();

	const rows = $derived(shifts.ok ? buildCoverage(shifts.value, days) : []);
	const byDay = $derived(coverageByDay(rows, days));
	const openTotal = $derived(rows.reduce((n, r) => n + r.openShifts, 0));

	let sheetOpen = $state(false);
	let selected = $state<{ row: CoverageRow; cell: Cell } | null>(null);

	function open(row: CoverageRow, cell: Cell) {
		selected = { row, cell };
		sheetOpen = true;
	}

	const rowName = (r: CoverageRow) => `${r.companyName} · ${r.locationName}`;
</script>

<Section
	title="Coverage, next 7 days"
	description={shifts.ok ? (openTotal ? `${openTotal} ${openTotal === 1 ? 'shift' : 'shifts'} still open` : 'Every shift is filled') : undefined}
	flush
>
	{#snippet actions()}
		<a href="/calendar" class="text-sm font-semibold text-primary-dark hover:underline">Calendar</a>
	{/snippet}
	{#if !shifts.ok}
		<div class="p-5 sm:p-6"><FailedLine what="the coverage board" /></div>
	{:else if rows.length === 0}
		<div class="p-5 sm:p-6">
			<EmptyState icon={CalendarCheck} title="No temp shifts in the next 7 days" description="Shifts appear here as practices post them." />
		</div>
	{:else}
		<!-- Desktop grid -->
		<div class="hidden overflow-x-auto md:block">
			<div
				class="grid min-w-[44rem] items-center gap-x-2 gap-y-1.5 px-5 py-4 sm:px-6"
				style="grid-template-columns: minmax(10rem, 15rem) repeat({days.length}, minmax(3.25rem, 1fr));"
				role="table"
				aria-label="Shifts filled per location and day"
			>
				<div role="row" class="contents">
					<span role="columnheader" class="text-xs font-semibold uppercase text-muted-foreground">Location</span>
					{#each days as d, i (d)}
						<span role="columnheader" class={cn('text-center text-xs font-semibold text-muted-foreground', i === 0 && 'text-foreground')}>
							{i === 0 ? 'Today' : formatDateOnly(d, 'EEE d')}
						</span>
					{/each}
				</div>
				{#each rows as row (row.locationId)}
					<div role="row" class="contents">
						<span role="rowheader" class="min-w-0 py-1">
							<span class="block truncate text-sm font-semibold">{row.companyName}</span>
							<span class="block truncate text-xs text-muted-foreground">{row.locationName}</span>
						</span>
						{#each row.cells as cell (cell.date)}
							<span role="cell">
								<CoverageCell {cell} label="{rowName(row)} · {formatDateOnly(cell.date)}" onopen={() => open(row, cell)} />
							</span>
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<!-- Phone: one list per day -->
		<div class="divide-y md:hidden">
			{#each byDay.filter((d) => d.total > 0) as day (day.date)}
				<div class="px-5 py-3">
					<p class="flex justify-between text-sm font-semibold">
						<span>{day.date === days[0] ? 'Today' : formatDateOnly(day.date)}</span>
						<span class="tabular-nums text-muted-foreground">{day.filled}/{day.total} filled</span>
					</p>
					<ul class="mt-2 space-y-1.5">
						{#each day.entries as e (e.row.locationId)}
							<li class="grid grid-cols-[1fr_4rem] items-center gap-3">
								<span class="min-w-0">
									<span class="block truncate text-sm">{e.row.companyName}</span>
									<span class="block truncate text-xs text-muted-foreground">{e.row.locationName}</span>
								</span>
								<CoverageCell cell={e.cell} label="{rowName(e.row)} · {formatDateOnly(e.cell.date)}" onopen={() => open(e.row, e.cell)} />
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<footer class="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-5 py-3 text-xs text-muted-foreground sm:px-6" aria-label="Legend">
			<span class="inline-flex items-center gap-1.5"><span class="size-3 rounded-sm border border-status-positive-border bg-status-positive-bg"></span>Filled</span>
			<span class="inline-flex items-center gap-1.5"><span class="size-3 rounded-sm border border-status-pending-border bg-status-pending-bg"></span>Partly filled</span>
			<span class="inline-flex items-center gap-1.5"><span class="size-3 rounded-sm border border-dashed border-status-warning-solid bg-status-warning-bg"></span>Open</span>
			<span>Numbers are filled / total shifts. Click a cell to see who's booked.</span>
		</footer>
	{/if}
</Section>

<CoverageDaySheet bind:open={sheetOpen} cell={selected?.cell ?? null} title={selected ? rowName(selected.row) : ''} />
