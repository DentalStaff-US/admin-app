<script lang="ts">
	// Upcoming shifts, next 14 days, by day (10 §4.1): the practice's coverage board.
	import { CalendarPlus, CheckCircle2, CircleDashed, MapPin } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import { groupShiftsByDay } from '../coverage';
	import { formatTimeRange, relativeDay } from '../format';
	import type { CoverageShift, Metric } from '../types';
	import FailedLine from './FailedLine.svelte';
	import type { Snippet } from 'svelte';

	let {
		shifts,
		showLocation,
		now = new Date(),
		empty
	}: { shifts: Metric<CoverageShift[]>; showLocation: boolean; now?: Date; empty?: Snippet } = $props();

	const upcoming = $derived(
		shifts.ok ? shifts.value.filter((s) => new Date(s.dayEnd).getTime() > now.getTime()) : []
	);
	const days = $derived(groupShiftsByDay(upcoming));
	const open = $derived(upcoming.filter((s) => s.status === 'OPEN').length);
</script>

<Section
	title="Upcoming shifts"
	description={shifts.ok ? `Next 14 days${open ? ` · ${open} still open` : ''}` : undefined}
	flush
>
	{#snippet actions()}
		<a href="/calendar" class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all on the calendar">View all</a>
	{/snippet}
	{#if !shifts.ok}
		<div class="p-5 sm:p-6"><FailedLine what="your upcoming shifts" /></div>
	{:else if days.length === 0}
		<div class="p-5 sm:p-6">
			<EmptyState icon={CalendarPlus} title="No shifts in the next 14 days" description="Post a requisition and we'll find a professional for it.">
				{#if empty}{@render empty()}{/if}
			</EmptyState>
		</div>
	{:else}
		<div class="divide-y">
			{#each days as day (day.date)}
				<div class="px-5 py-3 sm:px-6">
					<h3 class="text-overline uppercase text-muted-foreground">{relativeDay(day.shifts[0].dayStart, day.shifts[0].timezone, now)}</h3>
					<ul class="mt-2 space-y-2">
						{#each day.shifts as s (s.id)}
							<li>
								<a
									href="/requisitions/{s.requisitionId}"
									class="flex flex-col gap-1 rounded-md border px-3 py-2.5 transition hover:border-primary/40 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4"
								>
									<span class="w-36 shrink-0 text-sm font-semibold tabular-nums">{formatTimeRange(s.dayStart, s.dayEnd, s.timezone)}</span>
									<span class="min-w-0 flex-1">
										<span class="font-semibold">{s.disciplineName}</span>
										{#if showLocation}
											<span class="ml-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><MapPin class="size-3.5" aria-hidden="true" />{s.locationName}</span>
										{/if}
									</span>
									{#if s.professionalName}
										<span class="inline-flex items-center gap-1.5 text-sm text-status-positive-fg">
											<CheckCircle2 class="size-4" aria-hidden="true" />{s.professionalName}
										</span>
									{:else}
										<span class="inline-flex items-center gap-1.5 text-sm font-semibold text-status-warning-fg">
											<CircleDashed class="size-4" aria-hidden="true" />Still open
										</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</Section>
