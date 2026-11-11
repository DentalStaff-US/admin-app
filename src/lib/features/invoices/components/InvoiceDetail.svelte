<script lang="ts">
	import { can } from '$lib/authz';
	/**
	 * Invoice detail, admin and practice (06 › Invoices): same structure and
	 * actions as before, on tokens. Status and due date sit in the header; the
	 * payment method gets an explicit notice because the practice's
	 * client_invoice_method = PAPER overrides a connected Stripe customer.
	 */
	import { CreditCard, Download, Undo2, XCircle } from 'lucide-svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Page from '$dtss/Page.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import { TONE_CLASSES } from '$tokens/status';
	import { ActionConfirmDialog, FormDialog, HistorySection, RecordHeader, usd } from '$features/timesheets';
	import InvoiceLineItems from './InvoiceLineItems.svelte';
	import InvoicePaymentsSection from './InvoicePaymentsSection.svelte';
	import {
		invoiceMethodNotice,
		isInvoiceOverdue,
		toLineItemRows,
		type PaperTransaction,
		type StripePayment
	} from '../invoices';

	type Data = {
		user: { role: string };
		invoice: any;
		paperTransactions?: PaperTransaction[];
		stripePayments?: StripePayment[];
		activity?: any[];
	};

	let { data, isAdmin }: { data: Data; isAdmin: boolean } = $props();

	const d = $derived(data.invoice);
	const inv = $derived(d.invoice);
	const isPaper = $derived(inv.invoiceType === 'PAPER');
	const isPaid = $derived(inv.status === 'paid');
	const isVoided = $derived(inv.status === 'void');
	const amountRemaining = $derived(parseFloat(String(inv.amountRemaining ?? 0)));
	const amountPaid = $derived(parseFloat(String(inv.amountPaid ?? 0)));
	// The detail page's long-standing rule (void isn't excluded here; the list's is stricter).
	const overdueForPayment = $derived(inv.dueDate ? new Date(inv.dueDate) < new Date() && inv.status !== 'paid' : false);
	const overdue = $derived(isInvoiceOverdue(inv.status, inv.dueDate));
	const items = $derived(toLineItemRows(d.lineItems));
	const subtotal = $derived(items.reduce((s, i) => s + i.amount, 0));
	const method = $derived(invoiceMethodNotice({ invoiceType: inv.invoiceType, clientMethod: d.client?.clientInvoiceMethod, isAdmin }));
	// A failed Stripe attempt, only while the invoice is still unresolved.
	const paymentFailed = $derived(
		!isPaper && !!inv.attempted && (inv.attemptCount ?? 0) > 0 && !['paid', 'void', 'uncollectible'].includes(inv.status)
	);

	// Role matrix: charging, paper payments and voids are SUPERADMIN-only (ADMIN views).
	const mayPay = $derived(can(data.user, 'payments.record'));
	const mayVoid = $derived(can(data.user, 'invoices.void'));
	const canProcess = $derived(isAdmin && mayPay && !isPaper && overdueForPayment && inv.status !== 'void' && inv.status !== 'uncollectible');
	const canRecord = $derived(isAdmin && mayPay && isPaper && !isPaid && !isVoided);
	const canReverse = $derived(isAdmin && mayPay && isPaper && amountPaid > 0 && !isVoided);
	const canVoid = $derived(isAdmin && mayVoid && !isVoided && inv.status !== 'paid' && inv.status !== 'uncollectible');

	const day = (v: string | Date) => new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	const when = (v: string | Date) =>
		new Date(v).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

	let processOpen = $state(false);
	let recordOpen = $state(false);
	let reverseOpen = $state(false);
	let voidOpen = $state(false);

	type TxType = 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
	let txType = $state<TxType>('PAYMENT');
	let txAmount = $state('');
	let reverseAmount = $state('');
	$effect(() => {
		if (reverseOpen) reverseAmount = amountPaid.toFixed(2);
	});

	const client = $derived(`${d.clientUser?.firstName ?? ''} ${d.clientUser?.lastName ?? ''}`.trim());
	const professional = $derived(d.candidate ? `${d.candidate.user.firstName ?? ''} ${d.candidate.user.lastName ?? ''}`.trim() : null);
</script>

{#snippet requestFact()}
	{#if d.requisition}<a class="text-primary-dark hover:underline" href="/requisitions/{d.requisition.id}">#{d.requisition.id}</a>{:else}—{/if}
{/snippet}
{#snippet timesheetFact()}
	{#if d.timesheet}<a class="text-primary-dark hover:underline" href="/timesheets/{d.timesheet.id}">Open timesheet</a>{:else}—{/if}
{/snippet}
{#snippet dueFact()}
	<span class={overdue ? 'text-status-warning-fg' : ''}>{inv.dueDate ? day(inv.dueDate) : 'Not set'}</span>
{/snippet}

<Page>
	<RecordHeader
		title="Invoice {inv.invoiceNumber}"
		description={isAdmin ? (d.company?.companyName ?? client) : 'Invoice details and payment'}
		back={{ href: '/invoices', label: 'Invoices' }}
	>
		{#snippet meta()}
			<StatusBadge status={inv.status} />
			{#if overdue}<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold {TONE_CLASSES.warning}">Overdue</span>{/if}
			<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{isPaper ? 'Paper invoice' : 'Stripe invoice'}</span>
			<span class={cn(overdue && 'font-semibold text-status-warning-fg')}>{inv.dueDate ? `Due ${day(inv.dueDate)}` : 'No due date'}</span>
		{/snippet}
		{#snippet actions()}
			{#if !isAdmin && inv.status === 'open' && !isPaper && inv.stripeHostedUrl}
				<Button href={inv.stripeHostedUrl}><CreditCard class="mr-2 size-4" aria-hidden="true" />Pay invoice</Button>
			{/if}
			{#if canProcess}
				<Button on:click={() => (processOpen = true)}><CreditCard class="mr-2 size-4" aria-hidden="true" />Process payment…</Button>
			{/if}
			{#if canRecord}
				<Button on:click={() => (recordOpen = true)}><CreditCard class="mr-2 size-4" aria-hidden="true" />Record transaction</Button>
			{/if}
			{#if canReverse}
				<Button variant="outline" on:click={() => (reverseOpen = true)}><Undo2 class="mr-2 size-4" aria-hidden="true" />Reverse payment…</Button>
			{/if}
			{#if !isPaper && inv.stripePdfUrl}
				<Button variant="outline" href={inv.stripePdfUrl}><Download class="mr-2 size-4" aria-hidden="true" />PDF</Button>
			{:else if isPaper}
				<Button variant="outline" href="/invoices/{inv.id}/pdf" data-sveltekit-reload><Download class="mr-2 size-4" aria-hidden="true" />PDF</Button>
			{/if}
			{#if canVoid}
				<Button variant="destructiveOutline" on:click={() => (voidOpen = true)}><XCircle class="mr-2 size-4" aria-hidden="true" />Void…</Button>
			{/if}
		{/snippet}
	</RecordHeader>

	{#if isVoided}
		<Notice tone="negative" title="This invoice was voided{inv.voidedAt ? ` on ${day(inv.voidedAt)}` : ''}">
			{#if inv.voidReason}<p class="whitespace-pre-line"><b>Reason:</b> {inv.voidReason}</p>{:else}It's no longer due.{/if}
		</Notice>
	{:else if paymentFailed}
		<Notice tone="warning" title="Payment failed">
			{inv.attemptCount} payment attempt{inv.attemptCount === 1 ? ' has' : 's have'} failed on this invoice.{#if inv.status === 'open' && !isAdmin} You can retry with Pay invoice.{/if}
		</Notice>
	{/if}

	<FactGrid
		facts={[
			{ label: 'Issued', value: day(inv.createdAt) },
			{ label: 'Due', cell: dueFact },
			{ label: 'Requisition', cell: requestFact },
			{ label: 'Timesheet', cell: timesheetFact }
		]}
	/>

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="min-w-0 space-y-6 lg:col-span-2">
			{#if inv.description}
				<Section title="Description"><p class="whitespace-pre-line text-sm">{inv.description}</p></Section>
			{/if}
			<InvoiceLineItems {items} {subtotal} tax={Number(inv.taxAmount) || 0} total={Number(inv.total) || 0} paid={amountPaid} remaining={amountRemaining} />
			{#if isAdmin}
				<InvoicePaymentsSection
					paper={isPaper}
					transactions={data.paperTransactions ?? []}
					stripePayments={data.stripePayments ?? []}
					paidAt={inv.paidAt}
					total={Number(inv.total) || 0}
					{amountPaid}
					remaining={amountRemaining}
					{canRecord}
					onRecord={() => (recordOpen = true)}
				/>
				<HistorySection
					title="Activity"
					description="When the practice opened or downloaded this invoice, every email we sent about it, and every payment or status change."
					audit={data.activity ?? []}
					empty="No activity recorded yet."
				/>
			{/if}
		</div>

		<div class="space-y-6">
			<Section title="Payment method">
				<Notice tone={method.tone} title={method.title}>{method.body}</Notice>
				{#if isAdmin}
					<dl class="mt-4 space-y-1 text-sm">
						<dt class="text-muted-foreground">Invoice emails go to</dt>
						{#if d.company?.billingEmail}
							<dd class="break-all font-semibold">{d.company.billingEmail}</dd>
						{:else}
							<dd class="font-semibold">The account owner’s sign-in email</dd>
							<dd class="text-muted-foreground">No billing email is set.</dd>
						{/if}
					</dl>
				{/if}
			</Section>

			<Section title={isAdmin ? 'Parties' : 'Bill to'} flush>
				<dl class="divide-y text-sm">
					<div class="px-5 py-3 sm:px-6">
						<dt class="text-muted-foreground">{isAdmin ? 'Practice' : 'Billed to'}</dt>
						<dd class="font-semibold">
							{#if isAdmin}<a class="text-primary-dark hover:underline" href="/clients/{d.client?.id}">{d.company?.companyName || 'Client'}</a>{:else}{d.company?.companyName || client}{/if}
						</dd>
						{#if client}<dd class="text-muted-foreground">{client}</dd>{/if}
					</div>
					{#if professional}
						<div class="px-5 py-3 sm:px-6">
							<dt class="text-muted-foreground">Professional</dt>
							<dd class="font-semibold">{professional}</dd>
						</div>
					{/if}
					{#if isAdmin}
						<div class="flex justify-between gap-3 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Created</dt><dd class="tabular-nums">{when(inv.createdAt)}</dd></div>
						<div class="flex justify-between gap-3 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Updated</dt><dd class="tabular-nums">{when(inv.updatedAt)}</dd></div>
						<div class="flex justify-between gap-3 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Source</dt><dd class="capitalize">{inv.sourceType || 'manual'}</dd></div>
						{#if inv.stripeInvoiceId}
							<div class="flex justify-between gap-3 px-5 py-3 sm:px-6"><dt class="text-muted-foreground">Stripe ID</dt><dd class="break-all font-mono text-xs">{inv.stripeInvoiceId}</dd></div>
						{/if}
					{/if}
				</dl>
			</Section>
		</div>
	</div>
</Page>

{#if isAdmin}
	<ActionConfirmDialog
		bind:open={processOpen}
		title="Charge invoice {inv.invoiceNumber} now?"
		description="Stripe attempts to collect {usd(amountRemaining || Number(inv.total) || 0)} from {d.company?.companyName ?? 'the practice'}'s saved payment method right away, and the practice is notified."
		action="?/adminProcessInvoice"
		confirmLabel="Charge now"
	/>

	<FormDialog
		bind:open={recordOpen}
		title="Record a transaction"
		description="Against paper invoice {inv.invoiceNumber}. Balance remaining {usd(amountRemaining)}. The practice is notified."
		action="?/recordPaperTransaction"
		submitLabel="Record transaction"
		disabled={!txAmount}
	>
		<input type="hidden" name="invoiceId" value={inv.id} />
		<fieldset class="space-y-2">
			<legend class="text-sm font-semibold">Type</legend>
			<div class="inline-flex rounded-md bg-muted p-1" role="radiogroup" aria-label="Transaction type">
				{#each [['PAYMENT', 'Payment'], ['REFUND', 'Refund'], ['ADJUSTMENT', 'Adjustment']] as [value, label] (value)}
					<button
						type="button"
						role="radio"
						aria-checked={txType === value}
						class={cn('h-8 rounded-sm px-3 text-sm font-semibold text-muted-foreground', txType === value && 'bg-background text-foreground shadow-card')}
						onclick={() => (txType = value as TxType)}>{label}</button
					>
				{/each}
			</div>
			<input type="hidden" name="transactionType" value={txType} />
		</fieldset>
		<div class="space-y-2">
			<Label for="tx-amount">Amount ($)</Label>
			<Input id="tx-amount" name="amount" type="number" step="0.01" min="0.01" max={amountRemaining} inputmode="decimal" placeholder="0.00" bind:value={txAmount} required />
			{#if parseFloat(txAmount) > amountRemaining && txType === 'PAYMENT'}
				<p class="text-sm font-semibold text-status-warning-fg">More than the remaining balance of {usd(amountRemaining)}.</p>
			{/if}
		</div>
		<div class="space-y-2">
			<Label for="tx-batch">Batch or check number <span class="font-normal text-muted-foreground">(optional)</span></Label>
			<Input id="tx-batch" name="batchNumber" placeholder="CHK-1042" />
		</div>
		<div class="space-y-2">
			<Label for="tx-notes">Notes <span class="font-normal text-muted-foreground">(optional)</span></Label>
			<Textarea id="tx-notes" name="notes" rows={2} />
		</div>
	</FormDialog>

	<ActionConfirmDialog
		bind:open={reverseOpen}
		title="Reverse a payment on {inv.invoiceNumber}?"
		description="For a payment recorded in error. The invoice goes back to open with the amount owed again, and the practice is notified."
		action="?/reversePaperPayment"
		confirmLabel="Reverse payment"
		tone="destructive"
		hidden={{ invoiceId: inv.id }}
		reason={{ name: 'reason', label: 'Reason', placeholder: 'Why is this payment being reversed?', required: true }}
		disabled={!reverseAmount || parseFloat(reverseAmount) > amountPaid}
	>
		{#snippet fields()}
			<div class="space-y-2">
				<Label for="reverse-amount">Amount to reverse ($)</Label>
				<Input id="reverse-amount" name="amount" type="number" step="0.01" min="0.01" max={amountPaid} inputmode="decimal" bind:value={reverseAmount} required />
				{#if parseFloat(reverseAmount) > amountPaid}
					<p class="text-sm font-semibold text-status-warning-fg">More than the {usd(amountPaid)} paid.</p>
				{/if}
			</div>
		{/snippet}
	</ActionConfirmDialog>

	<ActionConfirmDialog
		bind:open={voidOpen}
		title="Void invoice {inv.invoiceNumber}?"
		description={`It's no longer due and collection stops; the practice is emailed.${inv.timesheetId ? ' It is tied to a timesheet, so that timesheet is voided too and its work reopens as a fresh draft to correct and re-invoice.' : ''} This can't be undone.`}
		action="?/voidInvoice"
		confirmLabel="Void invoice"
		tone="destructive"
		hidden={{ invoiceId: inv.id }}
		reason={{ name: 'reason', label: 'Reason', placeholder: 'Shown on the invoice' }}
	/>
{/if}
