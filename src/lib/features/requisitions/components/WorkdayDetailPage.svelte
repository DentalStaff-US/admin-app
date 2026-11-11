<!--
  One workday (a recurrence day) of a temp request: who's on it, its schedule,
  the request it belongs to, the hours worked and (admins) the ledger.
  The route's +page.svelte renders this with its page data unchanged.
-->
<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { enhance } from '$app/forms';
	import { formatInTimeZone } from 'date-fns-tz';
	import { superForm } from 'sveltekit-superforms/client';
	import { CalendarClock, ChevronDown, MoreHorizontal, Pencil, RefreshCw, Trash2, UserMinus, UserPlus, XCircle } from 'lucide-svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import IconSquare from '$dtss/IconSquare.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ActivityLog from '$lib/components/audit/ActivityLog.svelte';
	import WorkdayCredentialPanel from '$lib/components/certifications/WorkdayCredentialPanel.svelte';
	import { isAssignmentActive, isAssignmentHistory } from '$lib/_helpers/assignment';
	import { USER_ROLES } from '$lib/config/constants';
	import { cn } from '$lib/utils';
	import WorkdayAssignDialog from './WorkdayAssignDialog.svelte';

	/** The workday route's page data (see its +page.server.ts). */
	let { data }: { data: Record<string, any> } = $props();

	const isAdmin = $derived(data.user?.role === USER_ROLES.SUPERADMIN);
	const day = $derived(data.recurrenceDay?.recurrenceDay);
	const req = $derived(data.recurrenceDay?.requisition);
	const tz = $derived<string>(req?.referenceTimezone ?? 'America/New_York');
	const workday = $derived(data.workday);
	const candidate = $derived(workday?.candidate);
	const timesheet = $derived(workday?.timesheet);
	const hasWorkday = $derived(!!workday?.workday);

	// A workday row can outlive its assignment: cancelling keeps the row with
	// `cancelledAt` set, and blacklisting additionally flips the day back to OPEN
	// so it can be refilled. "Row exists" is not "assigned".
	const assignment = $derived(workday?.workday ?? null);
	const dayStatus = $derived<string | undefined>(day?.status);
	const hasActiveWorkday = $derived(isAssignmentActive(assignment));
	const showAssignmentHistory = $derived(isAssignmentHistory(assignment, dayStatus));
	const showProfessional = $derived((hasActiveWorkday || showAssignmentHistory) && !!candidate);
	const proName = $derived(candidate ? `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim() : '');

	const noun = 'Requisition';

	const fmtTime = (at: Date | string | null | undefined) => (at ? formatInTimeZone(at, tz, 'h:mmaaa') : '—');
	const dateLabel = $derived(
		day?.date
			? new Date(day.date).toLocaleDateString('en-US', {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: 'Workday'
	);
	const shiftDates = $derived(day?.date ? [String(day.date)] : []);
	const shiftWeekdayName = $derived(
		day?.date
			? new Date(`${String(day.date).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
					weekday: 'long',
					timeZone: 'UTC'
				})
			: 'that day'
	);
	const rate = $derived(timesheet?.adjustedHourlyRate ?? req?.hourlyRate ?? 0);
	const totalBilling = $derived(
		timesheet?.totalHoursBilled ? (Number(timesheet.totalHoursBilled) * rate).toFixed(2) : '0.00'
	);

	let editOpen = $state(false);
	let assignOpen = $state(false);
	let reassignOpen = $state(false);
	let unassignOpen = $state(false);
	let cancelOpen = $state(false);
	let deleteOpen = $state(false);
	let busy = $state(false);

	const {
		form,
		enhance: scheduleEnhance,
		submitting: scheduleSubmitting
	} = superForm(data.editWorkdayScheduleForm, {
		onResult({ result }) {
			if (result.type === 'success') editOpen = false;
		}
	});

	// Live duration preview: catches an AM/PM slip before saving.
	const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
	function durationLabel(start?: string, end?: string): { text: string; invalid: boolean } | null {
		if (!start || !end || !HHMM_RE.test(start) || !HHMM_RE.test(end)) return null;
		const toMin = (t: string) => {
			const [h, m] = t.split(':').map(Number);
			return h * 60 + m;
		};
		const mins = toMin(end) - toMin(start);
		if (mins <= 0) return { text: 'Ends before it starts', invalid: true };
		return { text: `Shift: ${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`, invalid: false };
	}
	const duration = $derived(durationLabel($form.startTime, $form.endTime));

	/** Closes the dialog and refreshes the page data, whatever the outcome. */
	const closeAfter = (close: () => void) => () => {
		busy = true;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			busy = false;
			if (result.type !== 'failure') close();
			await update();
		};
	};
</script>

{#snippet rateCell()}
	{#if timesheet?.adjustedHourlyRate != null}
		${timesheet.adjustedHourlyRate}/hr
		<span class="ml-1 text-sm font-normal text-muted-foreground line-through">${req?.hourlyRate}/hr</span>
	{:else}
		${req?.hourlyRate ?? '—'}/hr
	{/if}
{/snippet}

<Page>
	<PageHeader
		title={`Shift on ${dateLabel}`}
		description={[req?.disciplineName, req?.companyName, req?.locationName].filter(Boolean).join(' · ')}
	>
		{#snippet actions()}
			{#if isAdmin && dayStatus === 'OPEN' && !showProfessional}
				<Button on:click={() => (assignOpen = true)}>
					<UserPlus class="mr-2 size-4" aria-hidden="true" /> Assign professional ({data.qualifiedProfessionals?.length ?? 0})
				</Button>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
					<MoreHorizontal class="size-4" aria-hidden="true" /> Actions
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-52">
					<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2" on:click={() => (editOpen = true)}>
						<Pencil class="size-4" aria-hidden="true" /> Edit schedule
					</DropdownMenu.Item>
					{#if timesheet}
						<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2" href={`/timesheets/${timesheet.id}`}>
							<CalendarClock class="size-4" aria-hidden="true" /> View timesheet
						</DropdownMenu.Item>
					{/if}
					{#if dayStatus !== 'CANCELED' || isAdmin}
						<DropdownMenu.Separator />
					{/if}
					{#if dayStatus !== 'CANCELED'}
						<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2 text-destructive data-[highlighted]:text-destructive" on:click={() => (cancelOpen = true)}>
							<XCircle class="size-4" aria-hidden="true" /> Cancel shift…
						</DropdownMenu.Item>
					{/if}
					{#if isAdmin}
						<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2 text-destructive data-[highlighted]:text-destructive" on:click={() => (deleteOpen = true)}>
							<Trash2 class="size-4" aria-hidden="true" /> Delete workday…
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/snippet}
	</PageHeader>

	<div class="-mt-3 flex flex-wrap items-center gap-2 text-sm">
		<StatusBadge status={dayStatus} />
		{#if req?.id}
			<a href={`/requisitions/${req.id}`} class="font-semibold text-primary-dark hover:underline">
				{noun} #{req.id}
			</a>
		{/if}
	</div>

	<FactGrid
		facts={[
			{ label: 'Date', value: dateLabel },
			{ label: 'Hours', value: day ? `${fmtTime(day.dayStart)}–${fmtTime(day.dayEnd)}` : null },
			{ label: 'Lunch', value: day?.lunchStart && day?.lunchEnd ? `${fmtTime(day.lunchStart)}–${fmtTime(day.lunchEnd)}` : 'None' },
			{ label: 'Rate', cell: rateCell }
		]}
	/>

	<div class="grid gap-6 lg:grid-cols-3">
		<Section title="Professional">
			{#snippet actions()}
				{#if isAdmin && hasActiveWorkday && candidate}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1')}>
							Manage <ChevronDown class="size-3.5" aria-hidden="true" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2" on:click={() => (reassignOpen = true)}>
								<RefreshCw class="size-4" aria-hidden="true" /> Reassign
							</DropdownMenu.Item>
							<DropdownMenu.Item class="min-h-10 cursor-pointer gap-2 text-destructive data-[highlighted]:text-destructive" on:click={() => (unassignOpen = true)}>
								<UserMinus class="size-4" aria-hidden="true" /> Unassign…
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			{/snippet}

			{#if showProfessional}
				<div class="flex items-center gap-3">
					<Avatar.Root class="size-14">
						{#if candidate.avatarUrl}<Avatar.Image src={candidate.avatarUrl} alt="" />{/if}
						<Avatar.Fallback class="bg-gradient-to-br from-pro to-primary font-bold text-white">
							{candidate.firstName?.[0] ?? ''}{candidate.lastName?.[0] ?? ''}
						</Avatar.Fallback>
					</Avatar.Root>
					<div class="min-w-0">
						<p class={cn('text-h3', showAssignmentHistory && 'line-through')}>{proName}</p>
						{#if showAssignmentHistory}<p class="text-sm text-muted-foreground">Assignment cancelled</p>{/if}
					</div>
				</div>
				<dl class="mt-4 space-y-2 text-sm">
					<div class="flex justify-between gap-3">
						<dt class="text-muted-foreground">Email</dt>
						<dd class="truncate font-medium">{candidate.email ?? '—'}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-muted-foreground">Phone</dt>
						<dd class="font-medium tabular-nums">{candidate.phoneNumber ?? '—'}</dd>
					</div>
				</dl>
				{#if data.workdayCredential}
					<!-- Trust but verify: loudest when the credential has lapsed. -->
					<div class="mt-4 border-t pt-4">
						<WorkdayCredentialPanel credential={data.workdayCredential} workdayId={day?.id} />
					</div>
				{/if}
			{:else}
				<div class="flex items-center gap-3 py-2">
					<IconSquare icon={UserPlus} tone="neutral" />
					<p class="text-sm text-muted-foreground">
						{#if dayStatus === 'OPEN'}
							Nobody yet. This day is open for professionals to claim.
						{:else if dayStatus === 'UNFULFILLED'}
							Nobody claimed this day.
						{:else if dayStatus === 'CANCELED'}
							This day was cancelled.
						{:else}
							No professional assigned.
						{/if}
					</p>
				</div>
			{/if}
		</Section>

		<Section title={noun} class="lg:col-span-2">
			{#snippet actions()}<StatusBadge status={req?.status} />{/snippet}
			<dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
				<div>
					<dt class="text-muted-foreground">Practice</dt>
					<dd class="font-medium">{req?.companyName ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Location</dt>
					<dd class="font-medium">{req?.locationName ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Discipline</dt>
					<dd class="font-medium">{req?.disciplineName ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Experience</dt>
					<dd class="font-medium">{req?.experienceLevelName ?? 'No preference'}</dd>
				</div>
			</dl>
			<div class="mt-5 space-y-4 border-t pt-4">
				<div>
					<h3 class="text-overline uppercase text-muted-foreground">Job description</h3>
					<p class="mt-1 max-w-prose whitespace-pre-wrap text-sm">{req?.jobDescription}</p>
				</div>
				{#if req?.specialInstructions}
					<div>
						<h3 class="text-overline uppercase text-muted-foreground">Special instructions</h3>
						<p class="mt-1 max-w-prose whitespace-pre-wrap text-sm">{req.specialInstructions}</p>
					</div>
				{/if}
			</div>
		</Section>
	</div>

	{#if hasWorkday && timesheet}
		<Section title="Hours and billing">
			{#snippet actions()}
				<Button variant="outline" size="sm" href={`/timesheets/${timesheet.id}`}>Open timesheet</Button>
			{/snippet}
			<dl class="grid gap-3 sm:grid-cols-3">
				<div class="rounded-lg bg-muted p-3">
					<dt class="text-overline uppercase text-muted-foreground">Hours worked</dt>
					<dd class="mt-1 text-2xl font-extrabold tabular-nums">{timesheet.totalHoursWorked || '0.0'}</dd>
				</div>
				<div class="rounded-lg bg-muted p-3">
					<dt class="text-overline uppercase text-muted-foreground">Total billing</dt>
					<dd class="mt-1 text-2xl font-extrabold tabular-nums">${totalBilling}</dd>
				</div>
				<div class="rounded-lg bg-muted p-3">
					<dt class="text-overline uppercase text-muted-foreground">Timesheet</dt>
					<dd class="mt-2"><StatusBadge status={timesheet.status} /></dd>
				</div>
			</dl>
		</Section>
	{/if}

	{#if isAdmin}
		<Section title="Activity" description="Every view, claim, assignment and cancellation on this workday: who, when and from where.">
			<ActivityLog entries={data.activity ?? []} />
		</Section>
	{/if}
</Page>

<!-- Edit schedule: five fields, one purpose → Dialog (03 › Which overlay). -->
<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Edit schedule</Dialog.Title>
			<Dialog.Description>Times are in the requisition's timezone ({tz}). The professional is notified of changes.</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/editRecurrenceDay" use:scheduleEnhance class="space-y-4">
			<div class="space-y-1.5">
				<Label for="date" class="font-semibold">Date</Label>
				<Input id="date" name="date" type="date" bind:value={$form.date} required />
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="startTime" class="font-semibold">Start</Label>
					<Input id="startTime" name="startTime" type="time" bind:value={$form.startTime} required />
				</div>
				<div class="space-y-1.5">
					<Label for="endTime" class="font-semibold">End</Label>
					<Input id="endTime" name="endTime" type="time" bind:value={$form.endTime} required />
				</div>
			</div>
			{#if duration}
				<p class={cn('text-sm', duration.invalid ? 'font-semibold text-destructive' : 'text-muted-foreground')} role={duration.invalid ? 'alert' : undefined}>
					{duration.text}
				</p>
			{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="lunchStartTime" class="font-semibold">Lunch start</Label>
					<Input id="lunchStartTime" name="lunchStartTime" type="time" bind:value={$form.lunchStartTime} />
				</div>
				<div class="space-y-1.5">
					<Label for="lunchEndTime" class="font-semibold">Lunch end</Label>
					<Input id="lunchEndTime" name="lunchEndTime" type="time" bind:value={$form.lunchEndTime} />
				</div>
			</div>
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (editOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={$scheduleSubmitting}>{$scheduleSubmitting ? 'Saving…' : 'Save schedule'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

{#if isAdmin}
	<WorkdayAssignDialog
		bind:open={assignOpen}
		mode="assign"
		professionals={data.qualifiedProfessionals ?? []}
		requisitionId={data.requisition?.requisition?.id}
		recurrenceDayId={day?.id}
		requiredDisciplineId={data.requisition?.requisition?.disciplineId}
		{shiftDates}
		{shiftWeekdayName}
		radiusMiles={data.defaultSearchRadiusMiles ?? 60}
	/>
	<WorkdayAssignDialog
		bind:open={reassignOpen}
		mode="reassign"
		professionals={data.qualifiedProfessionals ?? []}
		requisitionId={data.requisition?.requisition?.id}
		recurrenceDayId={day?.id}
		requiredDisciplineId={data.requisition?.requisition?.disciplineId}
		{shiftDates}
		{shiftWeekdayName}
		radiusMiles={data.defaultSearchRadiusMiles ?? 60}
		current={candidate ? { id: candidate.id, firstName: candidate.firstName, lastName: candidate.lastName } : null}
	/>
{/if}

<ConfirmDialog
	bind:open={unassignOpen}
	title={`Unassign ${proName} from ${dateLabel}?`}
	description="Their shift is removed and the day goes back to Open. This day's hours come off their timesheet (an otherwise empty timesheet is voided)."
>
	{#snippet confirm()}
		<form method="POST" action="?/unassignCandidate" use:enhance={closeAfter(() => (unassignOpen = false))}>
			<input type="hidden" name="recurrenceDayId" value={day?.id} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>
				{busy ? 'Unassigning…' : 'Unassign'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<ConfirmDialog
	bind:open={cancelOpen}
	title={`Cancel the ${dateLabel} shift?`}
	description={hasActiveWorkday && proName
		? `${proName} will be notified and this day's hours come off their timesheet. This can't be undone.`
		: "The day is marked Canceled and won't be offered to professionals. This can't be undone."}
	cancelLabel="Keep shift"
>
	{#snippet confirm()}
		<form method="POST" action="?/cancelWorkday" use:enhance={closeAfter(() => (cancelOpen = false))}>
			<input type="hidden" name="recurrenceDayId" value={day?.id} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>
				{busy ? 'Cancelling…' : 'Cancel shift'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>

<!-- Archive, not a hard delete: deleteRecurrenceDay flags the row archived +
     CANCELED and keeps it, so no typed confirmation. -->
<ConfirmDialog
	bind:open={deleteOpen}
	title={`Delete the ${dateLabel} workday?`}
	description={`It's removed from the schedule and archived with its timesheet entry.${hasActiveWorkday && proName ? ` ${proName} will be notified.` : ''} This can't be undone.`}
>
	{#snippet confirm()}
		<form method="POST" action="?/deleteWorkday" use:enhance={closeAfter(() => (deleteOpen = false))}>
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={busy}>
				{busy ? 'Deleting…' : 'Delete workday'}
			</Button>
		</form>
	{/snippet}
</ConfirmDialog>
