<script lang="ts">
	/**
	 * Admin timesheet detail (06 › Timesheets: `TimesheetAdmin`). Same data,
	 * actions and gates as the old page; split into sections and restyled.
	 *
	 * Gates kept as they were: submit (on behalf) waits for the LAST shift on
	 * this sheet to START; approve waits for every linked shift to END
	 * (`hasUnfinishedWorkdays`). Hours are edited per day into hours_raw, each
	 * entry carrying its workdayId.
	 */
	import { Ban, CheckCircle2, CircleDollarSign, Clock, Pencil, Send, ShieldAlert, Undo2 } from 'lucide-svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import ActionConfirmDialog from './ActionConfirmDialog.svelte';
	import HistorySection from './HistorySection.svelte';
	import RecordHeader from './RecordHeader.svelte';
	import TimesheetBillingSection from './TimesheetBillingSection.svelte';
	import TimesheetDayTable from './TimesheetDayTable.svelte';
	import TimesheetExpensesSection from './TimesheetExpensesSection.svelte';
	import TimesheetFacts from './TimesheetFacts.svelte';
	import TimesheetHoursSheet from './TimesheetHoursSheet.svelte';
	import {
		entriesFromHoursRaw,
		hoursText,
		latestShiftStarted,
		totalEntryHours,
		usd,
		withTime,
		type TimeField
	} from '../timesheets';
	import { timesheetView, type TimesheetPageData } from '../view';

	let { data }: { data: TimesheetPageData } = $props();

	// --- Hours editing ------------------------------------------------------
	let editing = $state(false);
	let dirty = $state(false);
	const workdayIdByDate = $derived(
		Object.fromEntries(
			(data.workdays ?? [])
				.filter((w: any) => w?.recurrenceDay?.date && w?.workday?.id)
				.map((w: any) => [w.recurrenceDay.date, w.workday.id])
		) as Record<string, string>
	);
	const saved = () => timesheetView(data);
	const savedEntries = () =>
		entriesFromHoursRaw(
			[...saved().scheduledDates].sort(),
			data.timesheet?.hoursRaw,
			workdayIdByDate,
			saved().timeZone
		);
	let entries = $state(savedEntries());
	$effect(() => {
		// New page data (after a save) resets the editor.
		data.timesheet;
		entries = savedEntries();
		dirty = false;
	});

	const totalHours = $derived(totalEntryHours(entries));
	const hasHours = $derived(Object.values(entries).some((e) => e.hours > 0));

	// --- Derived view --------------------------------------------------------
	const v = $derived(timesheetView(data, editing ? Number(totalHours.toFixed(2)) : undefined));
	const t = $derived(data.timesheet ?? {});
	const wagesStatus = $derived(t.wagesStatus ?? null);
	const dataLoaded = $derived(!!(data.requisition?.referenceTimezone && data.workdays));
	const lastShiftStarted = $derived(dataLoaded ? latestShiftStarted(data.workdays, v.timeZone) : false);
	const canSaveDraft = $derived(hasHours && totalHours > 0);
	const canSubmitOnBehalf = $derived(canSaveDraft && lastShiftStarted);
	const submitHint = $derived(
		canSaveDraft && !lastShiftStarted ? "Can't submit until the last shift on this timesheet has started." : null
	);
	const canEditHours = $derived(!v.isApproved && !v.isVoid);
	const submitAction = $derived(v.isDiscrepancy ? '?/adminResubmitTimesheet' : '?/adminSubmitTimesheet');
	const paperBilling = $derived(data.invoiceMethod === 'PAPER');

	// --- Dialogs ---------------------------------------------------------------
	let approveOpen = $state(false);
	let rejectOpen = $state(false);
	let overrideOpen = $state(false);
	let submitOpen = $state(false);
	let voidOpen = $state(false);
	let voidInvoiceOpen = $state(false);
	let wagesPaidOpen = $state(false);
	let wagesDueOpen = $state(false);

	function editHours() {
		editing = true;
	}
	function changeTime(date: string, field: TimeField, value: string) {
		entries = withTime(entries, date, field, value, workdayIdByDate[date] ?? '');
		dirty = true;
	}
	function discard() {
		entries = savedEntries();
		dirty = false;
	}
	function confirmSubmit() {
		editing = false;
		submitOpen = true;
	}

	const sheetDays = $derived(
		v.days.rows
			.filter((r) => v.scheduledDates.includes(r.date))
			.map((r) => ({
				date: r.date,
				dayLabel: r.dayLabel,
				scheduled: r.scheduledStart && r.scheduledEnd ? `${r.scheduledStart} – ${r.scheduledEnd}` : null
			}))
	);

	const statusText = $derived(
		v.isDraft
			? 'Draft. Edit hours to fill it in, then save a draft (the practice isn’t told) or submit it on the professional’s behalf.'
			: v.isPending
				? 'Waiting for the practice to approve. You can approve on their behalf or send it back.'
				: v.isDiscrepancy
					? 'Sent back with a discrepancy. Edit the hours and resubmit.'
					: v.isVoid
						? 'Voided and its workdays released. A corrected draft regenerates automatically.'
						: v.isRejected
							? 'Rejected. You can edit and resubmit.'
							: 'Approved and invoiced. It’s locked: to correct it, void it (which voids the invoice too) and a fresh draft regenerates.'
	);
</script>

<Page>
	<RecordHeader title="Timesheet" back={{ href: '/timesheets', label: 'Timesheets' }}>
		{#snippet meta()}
			<StatusBadge status={v.status} />
			{#if wagesStatus}<StatusBadge status={wagesStatus} />{/if}
			<span>Week of {v.week}</span>
			<span class="inline-flex items-center gap-1"><Clock class="size-4" aria-hidden="true" />{v.timeZoneLabel} time</span>
		{/snippet}
		{#snippet actions()}
			{#if v.requisitionId}<Button variant="outline" href="/requisitions/{v.requisitionId}">View request</Button>{/if}
			{#if data.invoice}<Button variant="outline" href="/invoices/{data.invoice.id}">View invoice</Button>{/if}
		{/snippet}
	</RecordHeader>

	{#if v.isVoid}
		<Notice tone="negative" title="This timesheet was voided">Its workdays were released; a corrected draft regenerates from them.</Notice>
	{:else if v.isDiscrepancy}
		<Notice tone="warning" title="Sent back with a discrepancy">
			<p class="whitespace-pre-wrap">{t.discrepancyNote || 'No note was given.'}</p>
			<p class="mt-1">Edit the hours and resubmit.</p>
		</Notice>
	{:else if v.isPending && data.hasUnfinishedWorkdays}
		<Notice tone="pending" title="Approval isn’t open yet">
			{data.unfinishedWorkdayCount} assigned workday{data.unfinishedWorkdayCount === 1 ? ' hasn’t' : 's haven’t'} ended. Approval and invoicing unlock once every shift on this timesheet is over.
		</Notice>
	{/if}

	<TimesheetFacts
		professional={v.name}
		professionalDetail={[t.candidate?.puid ? `#${t.candidate.puid}` : null, `Comp code ${t.candidate?.workersCompCode ?? 'N/A'}`].filter(Boolean).join(' · ')}
		practice={t.clientCompanyName ?? '—'}
		practiceDetail="{v.discipline} · Req #{v.requisitionId}"
		week={v.week}
		hours={editing ? totalHours : parseFloat(t.totalHoursWorked || '0')}
		total={v.summary.total}
		estimate={!v.fee.frozen}
	/>

	<TimesheetDayTable table={v.days} timeZoneLabel={v.timeZoneLabel} />

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="min-w-0 space-y-6 lg:col-span-2">
			<TimesheetExpensesSection
				expenses={v.expenses}
				addExpenseForm={data.addExpenseForm}
				admin
				locked={v.isApproved || v.isVoid}
				professional={v.name}
			/>
			<HistorySection
				description="Every view and action recorded against this timesheet and its expenses."
				audit={data.auditHistory ?? []}
				empty="No views or changes recorded yet."
			/>
		</div>

		<div class="order-first space-y-6 lg:order-none">
			<Section title="Status">
				<p class="text-sm text-muted-foreground">{statusText}</p>
				<div class="mt-4 grid gap-2">
					{#if v.isPending}
						<Button variant="success" disabled={data.hasUnfinishedWorkdays} on:click={() => (approveOpen = true)}>
							<CheckCircle2 class="mr-2 size-4" aria-hidden="true" /> Approve…
						</Button>
						{#if v.isDiscrepancy}
							<!-- Kept from the old page; unreachable while the sheet is PENDING. -->
							<Button variant="outline" disabled={data.hasUnfinishedWorkdays} on:click={() => (overrideOpen = true)}>
								<ShieldAlert class="mr-2 size-4" aria-hidden="true" /> Override discrepancies…
							</Button>
						{/if}
						<Button variant="destructiveOutline" on:click={() => (rejectOpen = true)}>
							<Undo2 class="mr-2 size-4" aria-hidden="true" /> Send back…
						</Button>
					{/if}
					{#if canEditHours}
						<Button variant="outline" on:click={editHours}>
							<Pencil class="mr-2 size-4" aria-hidden="true" /> Edit hours
						</Button>
						{#if !v.isPending}
							<Button disabled={!canSubmitOnBehalf} on:click={() => (submitOpen = true)}>
								<Send class="mr-2 size-4" aria-hidden="true" /> Submit on behalf…
							</Button>
							{#if submitHint}<p class="text-sm text-muted-foreground">{submitHint}</p>{/if}
						{/if}
					{/if}
					{#if v.isApproved && wagesStatus === 'WAGES_DUE'}
						<Button variant="outline" on:click={() => (wagesPaidOpen = true)}>
							<CircleDollarSign class="mr-2 size-4" aria-hidden="true" /> Mark wages paid…
						</Button>
					{:else if v.isApproved && wagesStatus === 'WAGES_PAID'}
						<Button variant="outline" on:click={() => (wagesDueOpen = true)}>
							<CircleDollarSign class="mr-2 size-4" aria-hidden="true" /> Mark wages due…
						</Button>
					{/if}
					{#if v.isApproved && data.invoice}
						<Button variant="destructiveOutline" on:click={() => (voidInvoiceOpen = true)}>
							<Ban class="mr-2 size-4" aria-hidden="true" /> Void timesheet & invoice…
						</Button>
					{:else if !v.isVoid && !(v.isApproved && wagesStatus === 'WAGES_PAID')}
						<Button variant="destructiveOutline" on:click={() => (voidOpen = true)}>
							<Ban class="mr-2 size-4" aria-hidden="true" /> Void timesheet…
						</Button>
					{/if}
				</div>
			</Section>

			<TimesheetBillingSection
				summary={v.summary}
				baseRate={t.hourlyRate}
				adjustedRate={t.adjustedHourlyRate ?? null}
				fee={v.fee}
				priorWeekHours={data.priorWeekHours ?? 0}
				approvedExpenseCount={v.approvedExpenses.length}
				pendingExpenseCount={v.pendingExpenses.length}
				admin
				canEditRate={!v.isApproved}
				canEditFee={!v.isApproved && !v.isVoid}
			/>
		</div>
	</div>
</Page>

<TimesheetHoursSheet
	bind:open={editing}
	days={sheetDays}
	{entries}
	onTimeChange={changeTime}
	timeZoneLabel={v.timeZoneLabel}
	total={totalHours}
	{dirty}
	canSaveDraft={canSaveDraft}
	canSubmit={canSubmitOnBehalf}
	{submitHint}
	onSubmit={confirmSubmit}
	onDiscard={discard}
/>

<!-- Posts natively, like the old page did, so the result is a full reload. -->
<ActionConfirmDialog
	bind:open={submitOpen}
	title="Submit {v.name}'s timesheet?"
	description="Sends {hoursText(totalHours)} hours for {v.week} to {t.clientCompanyName ?? 'the practice'} for approval, on the professional's behalf. The practice is notified."
	action={submitAction}
	confirmLabel="Submit timesheet"
	hidden={{ entries: JSON.stringify(entries), totalHours: String(totalHours) }}
	native
/>

<ActionConfirmDialog
	bind:open={approveOpen}
	title="Approve {v.name}'s timesheet?"
	description="Approving {v.week} for {t.clientCompanyName ?? 'the practice'} creates the invoice ({usd(v.summary.total)}){paperBilling
		? ' as a paper invoice: this practice is on paper invoicing, which overrides its Stripe customer'
		: data.invoiceMethod === 'STRIPE'
			? ' through Stripe'
			: ''} and emails it to the practice's billing contact. The sheet is then locked."
	action="?/approveTimesheet"
	confirmLabel="Approve and invoice"
	tone="success"
/>

<ActionConfirmDialog
	bind:open={rejectOpen}
	title="Send this timesheet back?"
	description="{v.name}'s timesheet for {v.week} goes back as a discrepancy with your reason, so it can be corrected and resubmitted."
	action="?/rejectTimesheet"
	confirmLabel="Send back"
	tone="destructive"
	reason={{ name: 'discrepancyNote', label: 'What needs correcting', placeholder: 'Tuesday’s finish time doesn’t match the sign-out sheet…', required: true }}
/>

<ActionConfirmDialog
	bind:open={overrideOpen}
	title="Approve despite the discrepancy?"
	description="This approves and invoices {v.name}'s timesheet for {v.week} with the discrepancy unresolved."
	action="?/adminOverrideTimesheet"
	confirmLabel="Override and approve"
/>

<ActionConfirmDialog
	bind:open={voidOpen}
	title="Void this timesheet?"
	description="{v.name}'s timesheet for {v.week} is voided and its workdays released (there's no invoice). The voided sheet is kept as a record and a fresh draft regenerates. This can't be undone."
	action="?/deleteTimesheet"
	confirmLabel="Void timesheet"
	tone="destructive"
/>

<ActionConfirmDialog
	bind:open={voidInvoiceOpen}
	title="Void the timesheet and its invoice?"
	description="This voids {v.name}'s timesheet for {v.week} and its {data.invoice?.invoiceType === 'PAPER' ? 'paper' : 'Stripe'} invoice (no longer payable), clears the wages status and releases the workdays so a corrected timesheet regenerates. The practice is emailed. This can't be undone."
	action="?/voidTimesheet"
	confirmLabel="Void timesheet & invoice"
	tone="destructive"
	reason={{ name: 'reason', label: 'Reason', placeholder: 'Shown on the invoice' }}
/>

<ActionConfirmDialog
	bind:open={wagesPaidOpen}
	title="Mark wages paid?"
	description="Records that {v.name} has been paid for {v.week}."
	action="?/markWagesPaid"
	confirmLabel="Mark wages paid"
	tone="success"
/>

<ActionConfirmDialog
	bind:open={wagesDueOpen}
	title="Mark wages due again?"
	description="Moves {v.name}'s wages for {v.week} back to due."
	action="?/markWagesDue"
	confirmLabel="Mark wages due"
/>
