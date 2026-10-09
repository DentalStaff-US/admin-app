<!-- ─── MIRRORED FILE ──────────────────────────────────────────────────────────
  Twin: dtss-candidate-app/src/lib/components/availability/AvailabilityEditor.svelte
  Change one, change both. All logic and copy live in ./availability.ts.
  ──────────────────────────────────────────────────────────────────────────── -->
<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Info, CalendarOff } from 'lucide-svelte';
	import WeekdayPicker from './WeekdayPicker.svelte';
	import BlackoutCalendar from './BlackoutCalendar.svelte';
	import BlockRangeDialog from './BlockRangeDialog.svelte';
	import {
		COPY,
		countChanges,
		formatShortDate,
		hasZeroDays,
		isDirty,
		isNeverSet,
		normalizeDays,
		weekdaySummary,
		type AvailabilityState,
		type BookedDay,
		type ISODate
	} from './availability';

	/**
	 * Values as the server holds them. `initialAvailableDays: null` = never set.
	 * These are inputs only — the live working state is `days` and `dates` below,
	 * which hosts may bind to when they own their own submit (onboarding does).
	 */
	export let initialAvailableDays: number[] | null = null;
	export let initialBlockedDates: ISODate[] = [];
	export let bookedDates: BookedDay[] = [];
	/** 'YYYY-MM-DD' in the business timezone. */
	export let today: ISODate;
	/**
	 * FALSE when the availability fetch failed. The editor then renders an error and
	 * NO form — an editor built from empty state, then saved, would delete every
	 * blackout the professional has.
	 */
	export let loaded = true;
	export let readOnly = false;
	export let submitting = false;
	/** Hidden when the host owns its own footer (onboarding). */
	export let showSaveBar = true;
	export let subject = '';
	/** Shown when an admin was the last writer. */
	export let setByAdminOn: string | null = null;
	export let onSave: ((state: AvailabilityState) => void) | null = null;

	// The never-set state is captured BEFORE normalizing, because normalizing turns
	// null into all-seven and that distinction is the whole point of the feature.
	const original: AvailabilityState = {
		availableDays: initialAvailableDays,
		blockedDates: [...initialBlockedDates]
	};
	export const neverSet = isNeverSet(original);

	/** Live working state. Bindable, for hosts that own their own submit. */
	export let days: number[] = normalizeDays(initialAvailableDays);
	export let dates: ISODate[] = [...initialBlockedDates];

	$: current = { availableDays: days, blockedDates: dates } satisfies AvailabilityState;
	$: dirty = isDirty(original, current);
	$: changeCount = countChanges(original, current);
	$: zeroDays = hasZeroDays(days);
	$: canSave = dirty && !zeroDays && !submitting && !readOnly;

	$: upcomingBlocked = dates.filter((d) => d >= today).sort();

	function addRange(added: ISODate[]) {
		dates = [...new Set([...dates, ...added])].sort();
	}

	function clearAll() {
		if (!upcomingBlocked.length) return;
		if (!confirm(COPY.off.clearAllConfirm(upcomingBlocked.length))) return;
		// Only clears what the editor is authoritative for; past rows stay.
		dates = dates.filter((d) => d < today);
	}

	function discard() {
		days = normalizeDays(original.availableDays);
		dates = [...original.blockedDates];
	}

	function save() {
		if (!canSave) return;
		onSave?.({
			// All seven ticked on a never-set profile is still "not set": sending null
			// preserves the distinction the server needs.
			availableDays: neverSet && days.length === 7 ? null : days,
			blockedDates: dates
		});
	}

	// Tapping eight vacation dates and then hitting browser-back must not silently
	// discard them. Not optional polish on a phone.
	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm(COPY.save.leaveGuard)) cancel();
	});
</script>

<svelte:window
	on:beforeunload={(e) => {
		if (dirty && !submitting) {
			e.preventDefault();
			// Browsers show their own text; the return value just arms the prompt.
			return COPY.save.leaveGuard;
		}
	}}
/>

{#if !loaded}
	<Alert.Root variant="destructive">
		<Alert.Title>Couldn't load your availability</Alert.Title>
		<Alert.Description>{COPY.loadError}</Alert.Description>
	</Alert.Root>
{:else}
	<!-- Bottom padding only while the fixed mobile save bar is present; from sm: up
	     that bar is static and in flow, so no spacer is wanted. Interpolated rather
	     than `class:sm:pb-0` so the responsive prefix isn't parsed as part of a
	     Svelte directive name. -->
	<div class="space-y-8 {showSaveBar ? 'pb-32 sm:pb-0' : ''}">
		{#if neverSet}
			<!-- Default variant, NOT destructive and not amber. The premise of this
			     feature is that inaction is correct, so this must not read as a
			     problem to fix. -->
			<Alert.Root>
				<Info class="h-4 w-4" />
				<Alert.Title>{COPY.neverSet.title}</Alert.Title>
				<Alert.Description>{COPY.neverSet.body}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if setByAdminOn}
			<Alert.Root>
				<Info class="h-4 w-4" />
				<Alert.Description>{COPY.adminBanner(setByAdminOn)}</Alert.Description>
			</Alert.Root>
		{/if}

		<section>
			<WeekdayPicker bind:value={days} {bookedDates} disabled={readOnly} {subject} />
			<p class="mt-2 text-sm font-medium">{weekdaySummary(days)}</p>
		</section>

		<section class="space-y-3">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-base font-semibold">{COPY.off.heading}</h2>
				<p class="text-sm text-muted-foreground">
					{upcomingBlocked.length ? COPY.off.countN(upcomingBlocked.length) : COPY.off.countZero}
				</p>
			</div>

			<BlackoutCalendar bind:blocked={dates} booked={bookedDates} {today} {readOnly} {subject} />

			{#if !readOnly}
				<div>
					<BlockRangeDialog {today} booked={bookedDates} onBlock={addRange} disabled={readOnly} />
				</div>
			{/if}

			{#if upcomingBlocked.length}
				<ul class="flex flex-wrap gap-2">
					{#each upcomingBlocked as date (date)}
						<li>
							<span
								class="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
							>
								<CalendarOff class="h-3 w-3" aria-hidden="true" />
								{formatShortDate(date)}
								{#if !readOnly}
									<button
										type="button"
										class="ml-0.5 rounded-full px-1 hover:bg-destructive/20"
										on:click={() => (dates = dates.filter((d) => d !== date))}
									>
										<span aria-hidden="true">×</span>
										<span class="sr-only">Remove {formatShortDate(date)}</span>
									</button>
								{/if}
							</span>
						</li>
					{/each}
				</ul>

				{#if !readOnly}
					<Button variant="ghost" size="sm" type="button" on:click={clearAll}>
						{COPY.off.clearAll}
					</Button>
				{/if}
			{/if}
		</section>
	</div>

	{#if showSaveBar && !readOnly}
		<!-- fixed, not sticky: (protected)/+layout.svelte wraps the page in
		     `flex h-screen flex-col`, which makes sticky-bottom unreliable inside the
		     scroll container. The spacer above (pb-32) keeps content clear of it.

		     STACKED on mobile: side by side, the status line ("All changes saved")
		     wrapped to three lines and squeezed "Save availability" off the right
		     edge at 375px. Status on its own row, then the two buttons sharing the
		     width below. From sm: up it collapses back to one right-aligned row. -->
		<div
			class="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none"
		>
			<p class="text-sm text-muted-foreground sm:mr-auto">
				{dirty ? COPY.save.dirty(changeCount) : COPY.save.clean}
			</p>
			<div class="flex flex-wrap gap-2">
				<!-- flex-1 so the pair fills the row evenly; min-w-fit so a button can
				     never be narrower than its own label, which makes the pair WRAP to
				     two full-width rows below ~340px rather than clipping "Save
				     availability". Both released at sm:, where the buttons sit inline
				     and size to their content. -->
				<Button
					variant="outline"
					type="button"
					class="min-w-fit flex-1 sm:flex-none"
					disabled={!dirty || submitting}
					on:click={discard}
				>
					{COPY.save.discard}
				</Button>
				<Button
					type="button"
					class="min-w-fit flex-1 sm:flex-none"
					disabled={!canSave}
					on:click={save}
				>
					{submitting ? COPY.save.submitting : COPY.save.submit}
				</Button>
			</div>
		</div>
	{/if}
{/if}
