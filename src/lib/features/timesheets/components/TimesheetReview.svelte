<script lang="ts">
	/**
	 * Practice (client and client-staff) timesheet review (06 › Timesheets:
	 * `TimesheetReview`). Practices act only on a submitted (PENDING) sheet:
	 * Approve, or Report a problem (sends it back with a reason). On phones the
	 * two actions sit in a fixed bottom bar; the page header is never sticky.
	 */
	import { AlertTriangle, CheckCircle2, Clock, MessageSquareWarning } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import ActionConfirmDialog from './ActionConfirmDialog.svelte';
	import HistorySection from './HistorySection.svelte';
	import RecordHeader from './RecordHeader.svelte';
	import TimesheetBillingSection from './TimesheetBillingSection.svelte';
	import TimesheetDayTable from './TimesheetDayTable.svelte';
	import TimesheetExpensesSection from './TimesheetExpensesSection.svelte';
	import TimesheetFacts from './TimesheetFacts.svelte';
	import { practiceTimeline } from '../history';
	import { usd } from '../timesheets';
	import { timesheetView, type TimesheetPageData } from '../view';

	let { data }: { data: TimesheetPageData } = $props();

	const v = $derived(timesheetView(data));
	const t = $derived(data.timesheet ?? {});
	// The experience survey is for practices; admins approving on their behalf skip it.
	const canSurvey = $derived(data.user?.role === 'CLIENT' || data.user?.role === 'CLIENT_STAFF');
	const blocked = $derived(v.isDiscrepancy || !!data.hasUnfinishedWorkdays);

	let approveOpen = $state(false);
	let reportOpen = $state(false);
	let surveyOpen = $state(false);

	const approvedOn = $derived(
		new Date(t.approvedAt ?? t.updatedAt ?? Date.now()).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		})
	);
</script>

{#snippet reviewActions(full: boolean)}
	<Button variant="destructiveOutline" class={full ? 'min-h-11 flex-1' : ''} on:click={() => (reportOpen = true)}>
		<MessageSquareWarning class="mr-2 size-4" aria-hidden="true" /> Report a problem
	</Button>
	<Button variant="success" class={full ? 'min-h-11 flex-1' : ''} disabled={blocked} on:click={() => (approveOpen = true)}>
		<CheckCircle2 class="mr-2 size-4" aria-hidden="true" /> Approve
	</Button>
{/snippet}

<Page class={v.isPending ? 'pb-28 md:pb-8' : ''}>
	<RecordHeader title="Timesheet review" description="{v.name} · {v.discipline}" back={{ href: '/timesheets', label: 'Timesheets' }}>
		{#snippet meta()}
			<StatusBadge status={v.status} />
			<span>Week of {v.week}</span>
			<span class="inline-flex items-center gap-1"><Clock class="size-4" aria-hidden="true" />{v.timeZoneLabel} time</span>
		{/snippet}
		{#snippet actions()}
			{#if v.requisitionId}<Button variant="outline" href="/requisitions/{v.requisitionId}">View requisition</Button>{/if}
			{#if data.invoice}<Button variant="outline" href="/invoices/{data.invoice.id}">View invoice</Button>{/if}
			{#if v.isPending}
				<div class="hidden gap-2 md:flex">{@render reviewActions(false)}</div>
			{/if}
		{/snippet}
	</RecordHeader>

	{#if v.isPending && data.hasUnfinishedWorkdays}
		<Notice tone="pending" title="You can approve once the week's shifts are over">
			{data.unfinishedWorkdayCount} assigned workday{data.unfinishedWorkdayCount === 1 ? ' hasn’t' : 's haven’t'} ended yet. You can still report a problem now.
		</Notice>
	{:else if v.isPending}
		<Notice tone="pending" title="Waiting for your review">
			Check the hours below. Approving confirms they're accurate and creates the invoice.
		</Notice>
	{:else if v.isDiscrepancy}
		<Notice tone="warning" title="Sent back for correction">
			<p class="whitespace-pre-wrap">{t.discrepancyNote || 'No note was given.'}</p>
		</Notice>
	{:else if v.isApproved}
		<Notice tone="positive" title="Approved on {approvedOn}">
			Thanks. The invoice is on its way to your billing contact.
			{#if canSurvey}
				<button type="button" class="mt-1 block font-semibold underline underline-offset-4" onclick={() => (surveyOpen = true)}>Rate your experience with {v.name}</button>
			{/if}
		</Notice>
	{:else}
		<Notice tone="info" title="Not waiting for your review">
			{#if v.isDraft}This timesheet hasn't been submitted yet.{:else if v.isVoid}This timesheet was voided.{:else if v.isRejected}This timesheet was rejected.{:else}This timesheet isn't waiting for approval.{/if}
		</Notice>
	{/if}

	<TimesheetFacts
		professional={v.name}
		professionalDetail={t.candidate?.email ?? null}
		practice={t.clientCompanyName ?? '—'}
		practiceDetail="{v.discipline} · Req #{v.requisitionId}"
		week={v.week}
		hours={parseFloat(t.totalHoursWorked || '0')}
		total={v.summary.total}
		estimate={!v.fee.frozen}
	/>

	<TimesheetDayTable table={v.days} timeZoneLabel={v.timeZoneLabel} />

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="min-w-0 space-y-6 lg:col-span-2">
			<TimesheetExpensesSection
				expenses={v.expenses}
				addExpenseForm={data.addExpenseForm}
				locked={v.isApproved || v.isVoid}
				professional={v.name}
			/>
		</div>
		<div class="space-y-6">
			<TimesheetBillingSection
				summary={v.summary}
				baseRate={t.hourlyRate}
				adjustedRate={t.adjustedHourlyRate ?? null}
				fee={v.fee}
				priorWeekHours={data.priorWeekHours ?? 0}
				approvedExpenseCount={v.approvedExpenses.length}
				pendingExpenseCount={v.pendingExpenses.length}
			/>
			<HistorySection entries={practiceTimeline(t, v.expenses)} />
		</div>
	</div>
</Page>

{#if v.isPending}
	<!-- Phones: a fixed bottom action bar (not a sticky header). -->
	<div class="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 p-3 shadow-float backdrop-blur md:hidden">
		{@render reviewActions(true)}
	</div>
{/if}

<ActionConfirmDialog
	bind:open={approveOpen}
	title="Approve {v.name}'s timesheet?"
	description="You're confirming the hours for {v.week} are accurate. This creates your invoice ({usd(v.summary.total)}) and emails it to your billing contact. The timesheet is then locked."
	action="?/approveTimesheet"
	confirmLabel="Approve timesheet"
	tone="success"
	onSuccess={() => {
		if (canSurvey) surveyOpen = true;
	}}
/>

<ActionConfirmDialog
	bind:open={reportOpen}
	title="Report a problem with this timesheet?"
	description="It goes back to {v.name} with your note so the hours can be corrected and resubmitted. Nothing is invoiced until then."
	action="?/rejectTimesheet"
	confirmLabel="Send back"
	tone="destructive"
	reason={{ name: 'discrepancyNote', label: 'What needs correcting', placeholder: 'Tuesday was a half day; she left at 12:30…', required: true }}
/>

<!-- Post-approval experience survey. "No" blacklists this professional from the
     practice's company so they stop being matched to it. -->
<Dialog.Root bind:open={surveyOpen}>
	<Dialog.Content class="sm:max-w-lg sm:rounded-2xl">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Would you work with {v.name} again?</Dialog.Title>
			<Dialog.Description>If not, we won't match {v.name} to your practice again.</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="gap-2">
			<form method="POST" action="?/submitApprovalSurvey" use:enhance class="contents">
				<Button type="submit" variant="destructiveOutline" class="min-h-11 sm:min-h-10" on:click={() => (surveyOpen = false)}>
					<AlertTriangle class="mr-2 size-4" aria-hidden="true" /> No, don't match us again
				</Button>
			</form>
			<Button class="min-h-11 sm:min-h-10" on:click={() => (surveyOpen = false)}>Yes</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
