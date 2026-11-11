<script lang="ts">
	/**
	 * Admin "Edit hours": one start/end/break row per scheduled day, in a
	 * FormSheet (a long form; the sheet behind stays useful). Save draft posts
	 * without notifying anyone; Submit on behalf goes through a confirmation
	 * because it sends the sheet to the practice.
	 */
	import FormSheet from '$dtss/FormSheet.svelte';
	import Notice from '$dtss/Notice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { hoursText, lunchHours, type TimeEntry, type TimeField } from '../timesheets';

	type Day = { date: string; dayLabel: string; scheduled: string | null };

	let {
		open = $bindable(false),
		days,
		entries,
		onTimeChange,
		timeZoneLabel,
		total,
		dirty = false,
		canSaveDraft,
		canSubmit,
		submitHint,
		onSubmit,
		onDiscard
	}: {
		open?: boolean;
		days: Day[];
		entries: Record<string, TimeEntry>;
		onTimeChange: (date: string, field: TimeField, value: string) => void;
		timeZoneLabel: string;
		total: number;
		dirty?: boolean;
		canSaveDraft: boolean;
		canSubmit: boolean;
		/** Why Submit is disabled, when it is. */
		submitHint?: string | null;
		onSubmit: () => void;
		/** Cancel: put the times back as saved. */
		onDiscard?: () => void;
	} = $props();

	const FIELDS: { field: TimeField; label: string }[] = [
		{ field: 'startTime', label: 'Start' },
		{ field: 'endTime', label: 'End' },
		{ field: 'lunchStartTime', label: 'Break start' },
		{ field: 'lunchEndTime', label: 'Break end' }
	];
</script>

<FormSheet bind:open title="Edit hours" description="Times in {timeZoneLabel} time. Breaks are optional and unpaid." {dirty}>
	<form id="timesheet-hours" method="POST" action="?/adminSaveDraftTimesheet" class="space-y-5">
		<input type="hidden" name="entries" value={JSON.stringify(entries)} />
		<input type="hidden" name="totalHours" value={String(total)} />
		{#if days.length === 0}
			<Notice tone="warning" title="No scheduled workdays">There are no workdays on this timesheet to log hours against.</Notice>
		{/if}
		{#each days as day (day.date)}
			{@const entry = entries[day.date]}
			{#if entry}
				<fieldset class="space-y-3 rounded-lg bg-muted/50 p-4">
					<legend class="contents">
						<span class="flex w-full items-baseline justify-between gap-3">
							<span class="font-semibold">{day.dayLabel}</span>
							<span class="font-bold tabular-nums">{hoursText(entry.hours)} h</span>
						</span>
					</legend>
					{#if day.scheduled}<p class="text-sm text-muted-foreground">Scheduled {day.scheduled}</p>{/if}
					<div class="grid grid-cols-2 gap-3">
						{#each FIELDS as f (f.field)}
							<div class="space-y-1">
								<Label for="{day.date}-{f.field}" class="text-sm">{f.label}</Label>
								<Input
									id="{day.date}-{f.field}"
									type="time"
									value={entry[f.field]}
									on:input={(e) => onTimeChange(day.date, f.field, e.currentTarget.value)}
								/>
							</div>
						{/each}
					</div>
					{#if entry.lunchStartTime && entry.lunchEndTime}
						<p class="text-sm text-muted-foreground">Break {hoursText(lunchHours(entry.lunchStartTime, entry.lunchEndTime))} h, unpaid</p>
					{/if}
				</fieldset>
			{/if}
		{/each}
		<p class="flex items-baseline justify-between border-t pt-4 font-bold">
			<span>Total</span><span class="tabular-nums">{hoursText(total)} h</span>
		</p>
		{#if submitHint}<p class="text-sm text-muted-foreground">{submitHint}</p>{/if}
	</form>

	{#snippet footer()}
		<Button variant="outline" class="min-h-11 sm:min-h-10" on:click={() => {
				onDiscard?.();
				open = false;
			}}>Cancel</Button>
		<Button type="submit" form="timesheet-hours" variant="outline" class="min-h-11 sm:min-h-10" disabled={!canSaveDraft}>Save draft</Button>
		<Button class="min-h-11 sm:min-h-10" disabled={!canSubmit} on:click={onSubmit}>Submit on behalf…</Button>
	{/snippet}
</FormSheet>
