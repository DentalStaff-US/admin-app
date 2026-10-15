<!-- ─── MIRRORED FILE ──────────────────────────────────────────────────────────
  Twin: dtss-candidate-app/src/lib/components/availability/BlackoutCalendar.svelte
  Change one, change both. All logic and copy live in ./availability.ts.

  Built on the shadcn-svelte calendar (ui/calendar/*), composing
  CalendarPrimitive.Root directly with Props<true> because the vendored root types
  its Multiple generic as false — an array value works at runtime but fails
  `npm run check`. The vendored SUB-PARTS are generic-free and reused as-is, and
  none of them are modified: other callers depend on them.
  ──────────────────────────────────────────────────────────────────────────── -->
<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import * as Calendar from '$lib/components/ui/calendar';
	import { Lock } from 'lucide-svelte';
	import {
		COPY,
		fromCalendarDate,
		toCalendarDate,
		type BookedDay,
		type ISODate
	} from './availability';
	import type { DateValue } from '@internationalized/date';

	/** Dates marked as "cannot work". Bindable. */
	export let blocked: ISODate[] = [];
	export let booked: BookedDay[] = [];
	/** 'YYYY-MM-DD' in the business timezone — the earliest editable day. */
	export let today: ISODate;
	export let readOnly = false;
	export let subject = '';

	/**
	 * Sets, not arrays: isDateDisabled and isDateUnavailable are invoked per visible
	 * cell per render, so an Array.some() in there goes quadratic for a professional
	 * with dozens of blocked days.
	 */
	$: blockedSet = new Set(blocked);
	$: bookedSet = new Set(booked.map((b) => b.date));
	$: bookedLabels = new Map(booked.map((b) => [b.date, b.label]));

	$: minValue = toCalendarDate(today);
	// Deliberately NO maxValue: professionals may block dates arbitrarily far ahead,
	// so the next-month button must never stop.

	$: selected = blocked.map(toCalendarDate) as DateValue[];

	/** Announced to screen readers — melt's own announcer is silent in multiple mode. */
	let liveMessage = '';

	function onValueChange(next: DateValue[] | undefined) {
		if (readOnly) return;
		const incoming = (next ?? []).map(fromCalendarDate);
		// Never let a booked day become blocked through this control; the cell is
		// already unclickable, so this is defence in depth.
		const cleaned = incoming.filter((d) => !bookedSet.has(d));

		const before = new Set(blocked);
		const added = cleaned.find((d) => !before.has(d));
		const removed = [...before].find((d) => !cleaned.includes(d));
		liveMessage = added
			? COPY.a11y.marked(added)
			: removed
				? COPY.a11y.unmarked(removed)
				: liveMessage;

		blocked = cleaned.sort();
	}
</script>

<div class="space-y-3">
	<p class="text-sm text-muted-foreground">{COPY.off.help(subject)}</p>

	<!-- Legend. Each state carries a non-colour signal too (strikethrough, lock),
	     because dental professionals skew older and red/green alone is not enough. -->
	<div class="flex flex-wrap gap-3 text-xs">
		<span class="inline-flex items-center gap-1.5">
			<span class="h-4 w-4 rounded border bg-background"></span>{COPY.off.legendAvailable}
		</span>
		<span class="inline-flex items-center gap-1.5">
			<span
				class="inline-flex h-4 w-4 items-center justify-center rounded border border-destructive bg-destructive text-[10px] leading-none text-destructive-foreground"
				>×</span
			>{COPY.off.legendOff}
		</span>
		<span class="inline-flex items-center gap-1.5">
			<span
				class="inline-flex h-4 w-4 items-center justify-center rounded border border-sky-300 bg-sky-100 text-sky-700"
				><Lock class="h-2.5 w-2.5" /></span
			>{COPY.off.legendBooked}
		</span>
	</div>

	<CalendarPrimitive.Root
		multiple
		fixedWeeks
		weekStartsOn={0}
		weekdayFormat="short"
		{minValue}
		calendarLabel={COPY.a11y.calendarLabel(subject)}
		value={selected}
		onValueChange={onValueChange}
		readonly={readOnly}
		isDateUnavailable={(d) => bookedSet.has(d.toString())}
		class="rounded-md border p-3"
		let:months
		let:weekdays
	>
		<Calendar.Header>
			<Calendar.PrevButton />
			<Calendar.Heading />
			<Calendar.NextButton />
		</Calendar.Header>
		<Calendar.Months>
			{#each months as month (month.value.toString())}
				<Calendar.Grid class="w-full">
					<Calendar.GridHead>
						<!-- A 7-column grid rather than the vendored `flex`: it scales from
						     320px up, where flex plus fixed widths does not. -->
						<Calendar.GridRow class="grid grid-cols-7 gap-0.5">
							{#each weekdays as weekday}
								<Calendar.HeadCell class="w-full">{weekday.slice(0, 2)}</Calendar.HeadCell>
							{/each}
						</Calendar.GridRow>
					</Calendar.GridHead>
					<Calendar.GridBody>
						{#each month.weeks as weekDates}
							<Calendar.GridRow class="mt-0.5 grid grid-cols-7 gap-0.5">
								{#each weekDates as date (date.toString())}
									{@const iso = date.toString()}
									<Calendar.Cell {date} class="w-full p-0">
										<!-- h-11 (44px) is the WCAG 2.5.8 / Apple HIG minimum target.
										     The vendored h-9 is 36px, too small for thumbs. -->
										<Calendar.Day
											{date}
											month={month.value}
											class="mx-auto h-11 w-full max-w-11
												data-[selected]:bg-destructive data-[selected]:text-destructive-foreground
												data-[selected]:line-through
												data-[unavailable]:border data-[unavailable]:border-sky-300
												data-[unavailable]:bg-sky-100 data-[unavailable]:text-sky-800
												data-[unavailable]:no-underline data-[unavailable]:opacity-100"
											title={bookedSet.has(iso) ? COPY.off.bookedTooltip(subject) : undefined}
											let:selected={isSelected}
											let:unavailable
										>
											<span aria-hidden="true">{date.day}</span>
											<!--
												aria-selected on role="button" is not a supported ARIA
												combination, so the cell's own state may be dropped by
												screen readers. Put it in the slot as real text.
											-->
											{#if unavailable}
												<Lock class="ml-0.5 h-3 w-3" aria-hidden="true" />
												<span class="sr-only">{COPY.a11y.srBooked}</span>
											{:else if isSelected}
												<span class="sr-only">{COPY.a11y.srOff}</span>
											{/if}
										</Calendar.Day>
									</Calendar.Cell>
								{/each}
							</Calendar.GridRow>
						{/each}
					</Calendar.GridBody>
				</Calendar.Grid>
			{/each}
		</Calendar.Months>
	</CalendarPrimitive.Root>

	<p class="text-xs text-muted-foreground">{COPY.off.pastNote}</p>

	<!-- melt announces value changes only in single-value mode, so multiple-mode
	     toggles are silent without this. -->
	<div aria-live="polite" class="sr-only">{liveMessage}</div>

	{#if booked.length}
		<ul class="space-y-1 text-xs text-muted-foreground">
			{#each booked.slice(0, 3) as day (day.date)}
				<li>
					<Lock class="mr-1 inline h-3 w-3" aria-hidden="true" />
					{day.label ?? day.date}
				</li>
			{/each}
		</ul>
	{/if}
</div>
