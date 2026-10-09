<!-- ─── MIRRORED FILE ──────────────────────────────────────────────────────────
  Twin: dtss-candidate-app/src/lib/components/availability/BlockRangeDialog.svelte
  Change one, change both. All logic and copy live in ./availability.ts.

  Uses the vendored shadcn-svelte RangeCalendar as-is — its generic is not a
  problem here because a range IS its native value shape.
  ──────────────────────────────────────────────────────────────────────────── -->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';
	import { CalendarPlus } from 'lucide-svelte';
	import {
		COPY,
		expandRange,
		fromCalendarDate,
		toCalendarDate,
		type BookedDay,
		type ISODate
	} from './availability';
	import type { DateRange } from 'bits-ui';

	export let today: ISODate;
	export let booked: BookedDay[] = [];
	export let disabled = false;
	/** Called with the dates to add. The parent merges them into its blocked list. */
	export let onBlock: (dates: ISODate[]) => void;

	let open = false;
	let range: DateRange | undefined = undefined;

	$: bookedSet = new Set(booked.map((b) => b.date));
	$: minValue = toCalendarDate(today);

	$: start = range?.start ? fromCalendarDate(range.start) : null;
	$: end = range?.end ? fromCalendarDate(range.end) : null;
	$: preview =
		start && end ? expandRange(start, end, { today, booked: bookedSet }) : null;

	function confirm() {
		if (!preview?.added.length) return;
		onBlock(preview.added);
		range = undefined;
		open = false;
	}

	function cancel() {
		range = undefined;
		open = false;
	}
</script>

<Button variant="outline" {disabled} on:click={() => (open = true)} class="gap-2">
	<CalendarPlus class="h-4 w-4" />
	{COPY.range.button}
</Button>
<p class="mt-1 text-xs text-muted-foreground">{COPY.range.help}</p>

<!-- Full-screen on mobile, the idiom already used by the shift dialog. -->
<Dialog.Root bind:open>
	<Dialog.Content class="max-w-xl overflow-auto h-full md:h-auto">
		<Dialog.Header>
			<Dialog.Title>{COPY.range.title}</Dialog.Title>
			<Dialog.Description>{COPY.range.body}</Dialog.Description>
		</Dialog.Header>

		<div class="flex justify-center py-2">
			<!-- No maxValue: a range may start years ahead. -->
			<RangeCalendar bind:value={range} {minValue} weekdayFormat="short" />
		</div>

		{#if preview && start && end}
			<div class="space-y-2 text-sm">
				<p class="font-medium">{COPY.range.echo(start, end, preview.added.length)}</p>
				{#if preview.skippedBooked.length}
					<!-- Skipped days are REPORTED, never silently dropped. -->
					<p class="text-muted-foreground">
						{COPY.range.skippedBooked(preview.skippedBooked.length)}
					</p>
				{/if}
				{#if preview.skippedPast > 0}
					<p class="text-muted-foreground">{COPY.range.skippedPast}</p>
				{/if}
			</div>
		{/if}

		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" type="button" on:click={cancel}>{COPY.range.cancel}</Button>
			<Button type="button" disabled={!preview?.added.length} on:click={confirm}>
				{COPY.range.confirm(preview?.added.length ?? 0)}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
