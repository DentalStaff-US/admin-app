<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Section from '$dtss/Section.svelte';
	import AvailabilityEditor from '$lib/components/availability/AvailabilityEditor.svelte';
	import {
		formatShortDate,
		normalizeDays
	} from '$lib/components/availability/availability';

	type Availability = {
		availableDays: number[] | null;
		availableDaysSource?: string | null;
		availableDaysUpdatedAt?: Date | string | null;
		blackouts: { date: string; source: string; note?: string | null }[];
		bookedDates: { date: string; requisitionId: number; workdayId: string }[];
	};

	/**
	 * Staff setting a professional's availability, usually from a phone call.
	 * Saving is on someone else's behalf, so it's confirmed (was a native
	 * confirm()). Never touches shift state: marking a booked day off doesn't
	 * cancel the shift.
	 */
	let {
		availability,
		window: range,
		firstName,
		action = '?/updateAvailability'
	}: {
		availability: Availability | null;
		window: { from: string; to: string };
		firstName: string;
		action?: string;
	} = $props();

	let days = $state<number[]>(untrack(() => normalizeDays(availability?.availableDays ?? null)));
	let dates = $state<string[]>(untrack(() => availability?.blackouts.map((b) => b.date) ?? []));
	let submitting = $state(false);
	let confirmOpen = $state(false);
	let formEl: HTMLFormElement | undefined = $state();

	const booked = $derived(
		availability?.bookedDates.map((b) => ({
			date: b.date,
			label: `Working — Req #${b.requisitionId}`,
			workdayId: b.workdayId
		})) ?? []
	);
	const setByAdmin = $derived(availability?.availableDaysSource === 'ADMIN');
	const offCount = $derived(dates.filter((d) => d >= range.from).length);

	function save() {
		confirmOpen = false;
		submitting = true;
		formEl?.requestSubmit();
	}
</script>

<div class="space-y-6">
	<Section title="Availability">
		<p class="mb-4 text-sm text-muted-foreground">
			{firstName} is available by default. Only the days marked here are hidden from their shift board and left
			out of new-job texts.
			{#if setByAdmin}
				Last set by DTSS staff.
			{:else if availability?.availableDaysUpdatedAt}
				Last set by the professional.
			{:else}
				Nothing has been set, so they're shown as available every day.
			{/if}
		</p>
		<form
			method="POST"
			{action}
			bind:this={formEl}
			use:enhance={() => async ({ update }) => {
				submitting = false;
				await update();
			}}
		>
			<input type="hidden" name="availableDays" value={JSON.stringify(days)} />
			<input type="hidden" name="blockedDates" value={JSON.stringify(dates)} />
			<input type="hidden" name="replaceFrom" value={range.from} />
			<input type="hidden" name="replaceTo" value={range.to} />
			<AvailabilityEditor
				initialAvailableDays={availability?.availableDays ?? null}
				initialBlockedDates={availability?.blackouts.map((b) => b.date) ?? []}
				bookedDates={booked}
				bind:days
				bind:dates
				today={range.from}
				subject={firstName}
				{submitting}
				onSave={() => (confirmOpen = true)}
			/>
		</form>
	</Section>

	{#if availability?.blackouts.length || booked.length}
		<div class="grid gap-6 lg:grid-cols-2">
			{#if availability?.blackouts.length}
				<!-- A chronological list beside the grid: on a call, staff read dates off. -->
				<Section title="Days off on record" flush>
					<ul class="divide-y text-sm">
						{#each availability.blackouts as b (b.date)}
							<li class="flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6">
								<span class="font-semibold tabular-nums">{formatShortDate(b.date)}</span>
								<span class="text-right text-muted-foreground">
									{b.source === 'ADMIN' ? 'Set by DTSS staff' : 'Set by the professional'}{#if b.note}{' · '}{b.note}{/if}
								</span>
							</li>
						{/each}
					</ul>
				</Section>
			{/if}
			{#if booked.length}
				<Section title="Upcoming booked days" description="Locked above. Marking one off doesn't cancel the shift." flush>
					<ul class="divide-y text-sm">
						{#each booked as day (day.date)}
							<li class="flex items-center justify-between gap-3 px-5 py-2.5 sm:px-6">
								<span class="font-semibold tabular-nums">{formatShortDate(day.date)}</span>
								<span class="text-muted-foreground">{day.label}</span>
							</li>
						{/each}
					</ul>
				</Section>
			{/if}
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Save availability for {firstName}?"
	description="This hides shifts from them and stops their new-job texts on the days you've marked off{offCount ? ` (${offCount} ${offCount === 1 ? 'day' : 'days'})` : ''}. They'll see that DTSS staff made the change."
>
	{#snippet confirm()}
		<Button class="min-h-11 sm:min-h-10" on:click={save}>Save availability</Button>
	{/snippet}
</ConfirmDialog>
