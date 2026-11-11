<script lang="ts">
	/**
	 * "Add days" on a temp request (03 › Dialog & Sheet: the recurrence-days
	 * drawer becomes a Sheet with a Stepper). Dates → times → review, posting the
	 * same `?/addRecurrenceDays` payload the old addRecurrenceDaysDrawer did.
	 * Renders its own trigger button.
	 */
	import { tick } from 'svelte';
	import { Plus } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { updateFlash } from 'sveltekit-flash-message';
	import { page } from '$app/stores';
	import { DateFormatter, getLocalTimeZone, type DateValue } from '@internationalized/date';
	import type { DateRange } from 'bits-ui';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Stepper from '$dtss/Stepper.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';
	import { cn } from '$lib/utils';
	import { formatTimezoneName, toUTCDateString } from '$lib/_helpers/UTCTimezoneUtils';
	import {
		DEFAULT_TIMES,
		buildRecurrenceDaysPayload,
		emptyTimes,
		getDatesInRange,
		openDates,
		payloadReady,
		shiftDurationLabel,
		skippedDates,
		unavailableReasonLabel,
		type DayTimes
	} from '../recurrenceDays';
	import RecurrenceDayTimesFields from './RecurrenceDayTimesFields.svelte';
	import RecurrenceDaysProfessionalPicker from './RecurrenceDaysProfessionalPicker.svelte';

	type QualifiedPro = {
		candidateId: string;
		firstName: string;
		lastName: string;
		distance?: string | number;
		disciplineAbbr?: string;
	};
	type Blocked = { date: string; reason: string; message?: string };

	let {
		requisition,
		company,
		location,
		form,
		isAdmin = false,
		qualifiedProfessionals = [],
		blockedReason = null
	}: {
		requisition: { id: number | string; [key: string]: any };
		company?: unknown;
		location: { timezone?: string | null; operatingHours?: any; [key: string]: any };
		form: any;
		/** Admin-only direct assign: a picked professional makes the days FILLED. */
		isAdmin?: boolean;
		qualifiedProfessionals?: QualifiedPro[];
		/** Disables the trigger and says why (e.g. no billing set up). The server enforces it too. */
		blockedReason?: string | null;
	} = $props();

	const STEPS = ['Dates', 'Times', 'Review'];
	const FORM_ID = 'recurrence-days-form';
	const df = new DateFormatter('en-US', { dateStyle: 'full' });
	const dayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

	let open = $state(false);
	let step = $state(0);
	let multipleDays = $state(false);
	let sameTimeForAll = $state(true);
	let selectedRawDate = $state<DateValue | undefined>(undefined);
	let selectedRawDateRange = $state<DateRange | undefined>(undefined);
	let sharedTimes = $state<DayTimes>(emptyTimes());
	let perDayTimes = $state<Record<string, DayTimes>>({});
	let selectedCandidateId = $state('');
	let selectedName = $state<string | null>(null);
	let pickerKey = $state(0);

	// Dates the chosen professional marked unavailable, from the server's 409.
	// Warn, don't hide: staff may assign anyway once they've seen the dates.
	let unavailableDates = $state<Blocked[]>([]);
	let acknowledgeUnavailable = $state(false);
	let confirmUnavailableOpen = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);

	const timezoneName = $derived(formatTimezoneName(location?.timezone || 'UTC'));

	const {
		enhance,
		submitting,
		message: serverMessage
	} = superForm(form, {
		onSubmit({ formData }) {
			// The server refuses an unacknowledged assignment onto a blocked day and
			// records the acknowledgement, so it has to travel with the request.
			if (acknowledgeUnavailable) formData.set('acknowledgeUnavailable', 'true');
		},
		onResult({ result }) {
			if (result.type === 'success') open = false;
			const data = result.type === 'failure' ? (result.data as Record<string, any> | undefined) : undefined;
			if (data?.requiresAvailabilityConfirmation) {
				unavailableDates = (data.unavailableDates as Blocked[] | undefined) ?? [];
				acknowledgeUnavailable = false;
				confirmUnavailableOpen = unavailableDates.length > 0;
			}
		},
		onUpdate({ form }) {
			if (form.message === 'success') resetForm();
		},
		// superforms only invalidates on success, so pull a failure's flash in now.
		onUpdated: async ({ form }) => {
			if (!form.valid) await updateFlash(page);
		},
		onError(err) {
			console.error('Form submission error:', err);
		}
	});

	// Same date derivation as the old drawer, so the stored calendar days don't move.
	const chosenDates = $derived.by(() => {
		if (multipleDays && selectedRawDateRange?.start && selectedRawDateRange?.end) {
			const start = new Date(df.format(selectedRawDateRange.start.toDate(getLocalTimeZone())));
			const end = new Date(df.format(selectedRawDateRange.end.toDate(getLocalTimeZone())));
			return getDatesInRange(start, end);
		}
		if (!multipleDays && selectedRawDate) {
			return [new Date(df.format(selectedRawDate.toDate(getLocalTimeZone())))];
		}
		return [];
	});
	const dates = $derived(openDates(chosenDates, location?.operatingHours));
	const closedCount = $derived(chosenDates.length - dates.length);

	// Keep one per-day entry for each chosen date (new dates start blank).
	$effect(() => {
		const keys = new Set(dates.map((d) => toUTCDateString(d)));
		for (const key of keys) if (!perDayTimes[key]) perDayTimes[key] = emptyTimes();
		for (const key of Object.keys(perDayTimes)) if (!keys.has(key)) delete perDayTimes[key];
	});

	const payload = $derived(
		buildRecurrenceDaysPayload({
			multipleDays,
			sameTimeForAll,
			dates,
			sharedTimes,
			perDayTimes,
			requisitionId: requisition.id
		})
	);
	const ready = $derived(payloadReady(payload));
	const entries = $derived(Array.isArray(payload) ? payload : payload ? [payload] : []);
	const skipped = $derived(skippedDates(dates, payload));

	const dirty = $derived(
		chosenDates.length > 0 ||
			Object.values(sharedTimes).some(Boolean) ||
			selectedCandidateId !== ''
	);

	// A warning about one professional must not survive picking another.
	$effect(() => {
		void selectedCandidateId;
		unavailableDates = [];
		acknowledgeUnavailable = false;
	});

	function resetForm() {
		step = 0;
		multipleDays = false;
		sameTimeForAll = true;
		selectedRawDate = undefined;
		selectedRawDateRange = undefined;
		sharedTimes = emptyTimes();
		perDayTimes = {};
		selectedCandidateId = '';
		selectedName = null;
		unavailableDates = [];
		acknowledgeUnavailable = false;
		pickerKey += 1; // remount the picker so its search state clears too
	}

	function openSheet() {
		resetForm();
		open = true;
	}

	function cancel() {
		resetForm();
		open = false;
	}

	async function assignAnyway() {
		acknowledgeUnavailable = true;
		confirmUnavailableOpen = false;
		await tick();
		formEl?.requestSubmit();
	}

	const fmtTime = (t: string) => {
		if (!t) return '';
		const [h, m] = t.split(':').map(Number);
		const suffix = h >= 12 ? 'pm' : 'am';
		const hour = h % 12 || 12;
		return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
	};
	const fmtDate = (key: string) => dayLabel.format(new Date(`${key}T12:00:00Z`));
	const blockedSummary = $derived(
		unavailableDates.map((b) => `${fmtDate(b.date)} (${unavailableReasonLabel(b.reason)})`).join(', ')
	);
</script>

{#if blockedReason}
	<Hint text={blockedReason}>
		<Button disabled aria-describedby="add-days-blocked"><Plus aria-hidden="true" /> Add days</Button>
	</Hint>
	<span id="add-days-blocked" class="sr-only">{blockedReason}</span>
{:else}
	<Button on:click={openSheet}><Plus aria-hidden="true" /> Add days</Button>
{/if}

<FormSheet
	bind:open
	title="Add days"
	description="Times are in the practice's timezone ({timezoneName}). Days the practice is closed are left out."
	{dirty}
>
	<div class="space-y-6">
		<Stepper steps={STEPS} current={step} />

		{#if $serverMessage && $serverMessage !== 'success'}
			<Notice tone="negative" alert>{$serverMessage}</Notice>
		{/if}

		<form id={FORM_ID} bind:this={formEl} use:enhance method="POST" action="?/addRecurrenceDays" class="space-y-6">
			<input type="hidden" name="recurrenceDays" value={JSON.stringify(payload)} />
			<input type="hidden" name="candidateId" value={selectedCandidateId} />

			{#if step === 0}
				<fieldset class="space-y-4">
					<legend class="sr-only">Which days</legend>
					<div class="inline-flex rounded-md bg-muted p-1" role="group" aria-label="How many days">
						{#each [{ v: false, l: 'One day' }, { v: true, l: 'Several days' }] as opt (opt.l)}
							<button
								type="button"
								aria-pressed={multipleDays === opt.v}
								onclick={() => (multipleDays = opt.v)}
								class={cn(
									'h-9 rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
									multipleDays === opt.v && 'bg-background text-foreground shadow-card'
								)}
							>
								{opt.l}
							</button>
						{/each}
					</div>

					<div class="w-fit rounded-lg border">
						{#if multipleDays}
							<RangeCalendar bind:value={selectedRawDateRange} />
						{:else}
							<Calendar bind:value={selectedRawDate} />
						{/if}
					</div>

					<p class="text-sm text-muted-foreground" aria-live="polite">
						{#if dates.length}
							<span class="font-semibold text-foreground">{dates.length} {dates.length === 1 ? 'day' : 'days'}</span> selected{#if closedCount}{` · ${closedCount} left out because the practice is closed`}{/if}.
						{:else if chosenDates.length}
							The practice is closed on {chosenDates.length === 1 ? 'that day' : 'all of those days'}. Pick another date.
						{:else}
							{multipleDays ? 'Pick the first and last day.' : 'Pick a day.'}
						{/if}
					</p>
				</fieldset>
			{:else if step === 1}
				{#if multipleDays}
					<div class="flex items-center gap-2">
						<Checkbox id="same-time" bind:checked={sameTimeForAll} />
						<Label for="same-time" class="text-sm font-semibold">Same hours every day</Label>
					</div>
				{/if}

				{#if !multipleDays || sameTimeForAll}
					<div class="space-y-3">
						<p class="text-sm font-semibold">
							{multipleDays ? `All ${dates.length} days` : dates[0] ? fmtDate(toUTCDateString(dates[0])) : ''}
						</p>
						<RecurrenceDayTimesFields bind:times={sharedTimes} idPrefix="shared" />
						<Button variant="outline" size="sm" on:click={() => (sharedTimes = { ...DEFAULT_TIMES })}>
							Use 9am–5pm with lunch 12–1pm
						</Button>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">A day left blank is skipped.</p>
					<ul class="space-y-4">
						{#each dates as date (toUTCDateString(date))}
							{@const key = toUTCDateString(date)}
							{#if perDayTimes[key]}
								<li class="rounded-lg bg-muted/50 p-4">
									<p class="mb-3 text-sm font-bold">{fmtDate(key)}</p>
									<RecurrenceDayTimesFields bind:times={perDayTimes[key]} idPrefix="day-{key}" />
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
			{:else}
				<section aria-labelledby="review-days" class="space-y-3">
					<h3 id="review-days" class="text-h4">
						{entries.length} {entries.length === 1 ? 'day' : 'days'} to add
					</h3>
					<ul class="divide-y rounded-lg border">
						{#each entries as entry (entry.date)}
							{@const duration = shiftDurationLabel(entry.dayStartTime, entry.dayEndTime)}
							<li class="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
								<span class="font-semibold">{fmtDate(entry.date)}</span>
								<span class="tabular-nums text-muted-foreground">
									{[
										`${fmtTime(entry.dayStartTime)}–${fmtTime(entry.dayEndTime)}`,
										entry.lunchStartTime && entry.lunchEndTime
											? `lunch ${fmtTime(entry.lunchStartTime)}–${fmtTime(entry.lunchEndTime)}`
											: null,
										duration && !duration.invalid ? duration.text.replace('Shift: ', '') : null
									]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</li>
						{/each}
					</ul>
					{#if skipped.length}
						<p class="text-sm text-muted-foreground">
							Skipped (no hours): {skipped.map(fmtDate).join(', ')}
						</p>
					{/if}
				</section>

				{#if isAdmin}
					<div class="border-t pt-5">
						{#key pickerKey}
							<RecurrenceDaysProfessionalPicker
								requisitionId={requisition.id}
								{qualifiedProfessionals}
								bind:selectedCandidateId
								bind:selectedName
							/>
						{/key}
					</div>
				{/if}

				{#if unavailableDates.length && !confirmUnavailableOpen}
					<Notice tone="warning" title="{selectedName ?? 'This professional'} is unavailable on {unavailableDates.length} {unavailableDates.length === 1 ? 'day' : 'days'}">
						{blockedSummary}. Submit again to review and assign anyway.
					</Notice>
				{/if}
			{/if}
		</form>
	</div>

	{#snippet footer()}
		{#if step === 0}
			<Button variant="outline" on:click={cancel}>Cancel</Button>
			<Button disabled={dates.length === 0} on:click={() => (step = 1)}>Next: times</Button>
		{:else if step === 1}
			<Button variant="outline" on:click={() => (step = 0)}>Back</Button>
			<Button disabled={!ready} on:click={() => (step = 2)}>Next: review</Button>
		{:else}
			<Button variant="outline" on:click={() => (step = 1)}>Back</Button>
			<Button type="submit" form={FORM_ID} disabled={!ready || $submitting}>
				{#if $submitting}
					{selectedCandidateId ? 'Assigning…' : 'Adding…'}
				{:else}
					{selectedCandidateId ? `Add ${entries.length} and assign` : `Add ${entries.length} ${entries.length === 1 ? 'day' : 'days'}`}
				{/if}
			</Button>
		{/if}
	{/snippet}
</FormSheet>

<ConfirmDialog
	bind:open={confirmUnavailableOpen}
	title="Assign {selectedName ?? 'this professional'} anyway?"
	description="{selectedName ?? 'They'} marked {unavailableDates.length === 1 ? 'this day' : 'these days'} as unavailable: {blockedSummary}. They'll be assigned and notified on every day you're adding, and the override is recorded."
>
	{#snippet confirm()}
		<Button on:click={assignAnyway}>Assign anyway</Button>
	{/snippet}
</ConfirmDialog>
