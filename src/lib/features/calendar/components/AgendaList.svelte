<script lang="ts">
	import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { addDays, agendaWeek, dayKey, eventStatus, startOfWeek, timeRange, weekLabel, type ShiftEvent } from '../calendar';

	let {
		events,
		onselect,
		today = new Date()
	}: { events: ShiftEvent[]; onselect: (event: ShiftEvent) => void; today?: Date } = $props();

	let weekStart = $state(startOfWeek(today));
	const days = $derived(agendaWeek(events, weekStart));
	const todayKey = $derived(dayKey(today));

	const dayHeading = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
</script>

<!-- 06 › Calendar, mobile: an agenda list a week at a time instead of a month grid. -->
<section aria-label="Shifts by day" class="space-y-4">
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-h3" aria-live="polite">{weekLabel(weekStart)}</h2>
		<div class="flex gap-1">
			<Button variant="outline" size="icon" class="size-10" aria-label="Previous week" on:click={() => (weekStart = addDays(weekStart, -7))}>
				<ChevronLeft class="size-4" aria-hidden="true" />
			</Button>
			<Button variant="outline" size="sm" class="h-10" on:click={() => (weekStart = startOfWeek(today))}>Today</Button>
			<Button variant="outline" size="icon" class="size-10" aria-label="Next week" on:click={() => (weekStart = addDays(weekStart, 7))}>
				<ChevronRight class="size-4" aria-hidden="true" />
			</Button>
		</div>
	</div>

	{#each days as day (day.key)}
		<div>
			<h3 class="mb-2 text-overline font-bold uppercase text-muted-foreground">
				{dayHeading(day.date)}{#if day.key === todayKey}<span class="ml-2 rounded-full bg-primary-soft px-2 py-0.5 normal-case text-primary-dark">Today</span>{/if}
			</h3>
			<ul class="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
				{#each day.events as event (event.extendedProps.recurrenceDay?.id ?? `${event.title}${event.start}`)}
					{@const p = event.extendedProps}
					<li>
						<button
							type="button"
							class="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
							onclick={() => onselect(event)}
						>
							<span class="min-w-0">
								<span class="block font-bold">{String(event.title).trim()}{p.discipline?.name ? ` · ${p.discipline.name}` : ''}</span>
								<span class="block text-sm tabular-nums">{timeRange(event)}</span>
								<span class="block truncate text-sm text-muted-foreground">
									{[p.client?.companyName ?? p.requisition?.client?.companyName, p.location?.name].filter(Boolean).join(' · ')}
								</span>
							</span>
							<StatusBadge status={eventStatus(event)} />
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<div class="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center">
			<CalendarDays class="size-6 text-muted-foreground" aria-hidden="true" />
			<p class="mt-2 text-sm text-muted-foreground">No shifts this week.</p>
		</div>
	{/each}
</section>
