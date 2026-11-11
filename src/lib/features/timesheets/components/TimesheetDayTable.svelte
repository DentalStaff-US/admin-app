<script lang="ts">
	/**
	 * The day-by-day table (06 › Timesheets): scheduled vs actual times, breaks,
	 * regular/overtime hours. Rows that don't match the schedule are tinted and
	 * say why. Phones get one card per day (more than 4 columns).
	 */
	import type { Snippet } from 'svelte';
	import { AlertTriangle, CalendarX2 } from 'lucide-svelte';
	import Section from '$dtss/Section.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { cn } from '$lib/utils';
	import { hoursText, type DayTable } from '../timesheets';

	let {
		table,
		timeZoneLabel,
		actions
	}: { table: DayTable; timeZoneLabel: string; actions?: Snippet } = $props();

	const range = (a: string | null, b: string | null) => (a && b ? `${a} – ${b}` : '—');
	const flagged = $derived(table.rows.filter((r) => r.discrepancy).length);
	const description = $derived(
		`Times in ${timeZoneLabel} time.` +
			(flagged ? ` ${flagged} day${flagged === 1 ? '' : 's'} differ${flagged === 1 ? 's' : ''} from the schedule.` : '')
	);
</script>

<Section title="Hours by day" {description} flush {actions}>
	{#if table.rows.length === 0}
		<div class="p-4 sm:p-6">
			<EmptyState icon={CalendarX2} title="No shifts on this timesheet" description="No scheduled workdays or logged hours were found for this week." />
		</div>
	{:else}
		<!-- Phones: one card per day -->
		<ul class="divide-y md:hidden">
			{#each table.rows as row (row.date)}
				<li class={cn('space-y-2 px-4 py-3', row.discrepancy && 'bg-status-warning-bg')}>
					<div class="flex items-baseline justify-between gap-3">
						<p class="font-semibold">{row.dayLabel}</p>
						<p class="font-bold tabular-nums">{row.hours === null ? '—' : `${hoursText(row.hours)} h`}</p>
					</div>
					<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
						<dt class="text-muted-foreground">Scheduled</dt>
						<dd class="text-right tabular-nums">{range(row.scheduledStart, row.scheduledEnd)}</dd>
						<dt class="text-muted-foreground">Actual</dt>
						<dd class="text-right tabular-nums">{range(row.actualStart, row.actualEnd)}</dd>
						<dt class="text-muted-foreground">Break</dt>
						<dd class="text-right tabular-nums">{row.breakHours ? `${hoursText(row.breakHours)} h` : '—'}</dd>
						{#if row.overtime > 0}
							<dt class="text-muted-foreground">Regular · OT</dt>
							<dd class="text-right tabular-nums">{hoursText(row.regular)} · {hoursText(row.overtime)}</dd>
						{/if}
					</dl>
					{#if row.discrepancy}
						<p class="flex items-start gap-1.5 text-sm font-semibold text-status-warning-fg">
							<AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{row.discrepancy}
						</p>
					{/if}
				</li>
			{/each}
			<li class="flex items-baseline justify-between bg-muted/50 px-4 py-3 font-bold">
				<span>Total</span>
				<span class="tabular-nums">
					{hoursText(table.totals.hours)} h{#if table.totals.overtime > 0}<span class="ml-1 font-semibold text-muted-foreground">({hoursText(table.totals.overtime)} OT)</span>{/if}
				</span>
			</li>
		</ul>

		<div class="hidden overflow-x-auto md:block">
			<table class="w-full text-sm">
				<caption class="sr-only">Hours by day, {timeZoneLabel} time</caption>
				<thead class="bg-muted/50 text-left">
					<tr>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-overline font-bold uppercase text-muted-foreground">Day</th>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-overline font-bold uppercase text-muted-foreground">Scheduled</th>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-overline font-bold uppercase text-muted-foreground">Actual</th>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-right text-overline font-bold uppercase text-muted-foreground">Break</th>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-right text-overline font-bold uppercase text-muted-foreground">Regular</th>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-right text-overline font-bold uppercase text-muted-foreground">OT</th>
						<th scope="col" class="whitespace-nowrap px-4 py-3 text-right text-overline font-bold uppercase text-muted-foreground">Hours</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each table.rows as row (row.date)}
						<tr class={cn('align-top', row.discrepancy && 'bg-status-warning-bg')}>
							<th scope="row" class="whitespace-nowrap px-4 py-3 text-left font-semibold">
								{row.dayLabel}
								{#if row.discrepancy}
									<span class="mt-0.5 flex items-center gap-1 text-xs font-semibold text-status-warning-fg">
										<AlertTriangle class="size-3.5 shrink-0" aria-hidden="true" />{row.discrepancy}
									</span>
								{/if}
							</th>
							<td class="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{range(row.scheduledStart, row.scheduledEnd)}</td>
							<td class="whitespace-nowrap px-4 py-3 tabular-nums">
								{#if row.hours === null}<span class="text-muted-foreground">No hours entered</span>{:else}{range(row.actualStart, row.actualEnd)}{/if}
							</td>
							<td class="px-4 py-3 text-right tabular-nums">{row.breakHours ? hoursText(row.breakHours) : '—'}</td>
							<td class="px-4 py-3 text-right tabular-nums">{row.hours === null ? '—' : hoursText(row.regular)}</td>
							<td class="px-4 py-3 text-right tabular-nums">{row.overtime > 0 ? hoursText(row.overtime) : '—'}</td>
							<td class="px-4 py-3 text-right font-semibold tabular-nums">{hoursText(row.hours)}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot class="border-t bg-muted/50 font-bold">
					<tr>
						<th scope="row" class="px-4 py-3 text-left">Total</th>
						<td class="px-4 py-3 tabular-nums text-muted-foreground">{table.totals.scheduledHours ? `${hoursText(table.totals.scheduledHours)} h scheduled` : ''}</td>
						<td></td>
						<td></td>
						<td class="px-4 py-3 text-right tabular-nums">{hoursText(table.totals.regular)}</td>
						<td class="px-4 py-3 text-right tabular-nums">{table.totals.overtime > 0 ? hoursText(table.totals.overtime) : '—'}</td>
						<td class="px-4 py-3 text-right tabular-nums">{hoursText(table.totals.hours)}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}
</Section>
