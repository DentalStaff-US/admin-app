<script lang="ts">
	import { format } from 'date-fns';
	import { CreditCard, ExternalLink } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import type {
		RequisitionBilling,
		RequisitionBillingInvoice,
		RequisitionPaymentRow
	} from '$lib/server/requisitions/billing';

	let {
		billing,
		isAdmin = false,
		canOpenInvoicePage = false,
		permanentPosition = true,
		requisitionStatus = null,
		onCreateInvoice
	}: {
		billing: RequisitionBilling;
		isAdmin?: boolean;
		/** CLIENT can open /invoices/[id]; CLIENT_STAFF cannot, so they get the Stripe links. */
		canOpenInvoicePage?: boolean;
		permanentPosition?: boolean;
		requisitionStatus?: string | null;
		onCreateInvoice?: () => void;
	} = $props();

	const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	const day = (d: Date | string | null) => (d ? format(new Date(d), 'MMM d, yyyy') : '—');
	const summary = $derived(billing.summary);
	const invoices = $derived(billing.invoices);
	const payments = $derived(billing.payments);

	const invoiceColumns: DataColumn<RequisitionBillingInvoice>[] = [
		{ id: 'number', header: 'Invoice #', value: (i) => i.invoiceNumber, class: 'font-semibold' },
		{ id: 'status', header: 'Status', cell: invoiceStatus },
		{ id: 'method', header: 'Method', value: (i) => (i.invoiceType === 'PAPER' ? 'Paper' : 'Stripe') },
		{ id: 'total', header: 'Total', value: (i) => money(i.total), numeric: true },
		{ id: 'paid', header: 'Paid', value: (i) => money(i.amountPaid), numeric: true },
		{ id: 'remaining', header: 'Remaining', value: (i) => money(i.amountRemaining), numeric: true },
		{ id: 'due', header: 'Due', value: (i) => day(i.dueDate), class: 'whitespace-nowrap' },
		{ id: 'created', header: 'Created', value: (i) => day(i.createdAt), class: 'whitespace-nowrap' },
		{ id: 'open', header: 'Open', srOnlyHeader: true, cell: invoiceLink }
	];

	const paymentColumns = $derived<DataColumn<RequisitionPaymentRow>[]>([
		{ id: 'date', header: 'Date', value: (p) => day(p.date), class: 'whitespace-nowrap' },
		{ id: 'invoice', header: 'Invoice #', value: (p) => p.invoiceNumber },
		{ id: 'type', header: 'Type', value: (p) => p.type.charAt(0) + p.type.slice(1).toLowerCase() },
		{ id: 'method', header: 'Method', value: (p) => (p.method === 'PAPER' ? 'Paper / manual' : 'Stripe') },
		{ id: 'amount', header: 'Amount', cell: paymentAmount, numeric: true },
		...(isAdmin
			? [
					{ id: 'pstatus', header: 'Status', value: (p: RequisitionPaymentRow) => p.status.charAt(0) + p.status.slice(1).toLowerCase() },
					{ id: 'ref', header: 'Reference', value: (p: RequisitionPaymentRow) => p.batchNumber ?? p.reference ?? '—', class: 'font-mono text-xs text-muted-foreground' }
				]
			: [])
	]);
</script>

{#snippet invoiceStatus(i: RequisitionBillingInvoice)}<StatusBadge status={i.status} />{/snippet}

{#snippet invoiceLink(i: RequisitionBillingInvoice)}
	{#if isAdmin || canOpenInvoicePage}
		<a href={`/invoices/${i.id}`} class="font-semibold text-primary-dark hover:underline">View<span class="sr-only"> invoice {i.invoiceNumber}</span></a>
	{:else if i.stripeHostedUrl || i.stripePdfUrl}
		<a href={i.stripeHostedUrl ?? i.stripePdfUrl} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 font-semibold text-primary-dark hover:underline">
			View<span class="sr-only"> invoice {i.invoiceNumber} (opens Stripe)</span> <ExternalLink class="size-3" aria-hidden="true" />
		</a>
	{/if}
{/snippet}

{#snippet invoiceMobile(i: RequisitionBillingInvoice)}
	<div class={i.status === 'void' ? 'opacity-60' : ''}>
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="font-semibold">{i.invoiceNumber}</p>
				<p class="text-sm text-muted-foreground">{i.invoiceType === 'PAPER' ? 'Paper' : 'Stripe'} · due {day(i.dueDate)}</p>
			</div>
			<StatusBadge status={i.status} />
		</div>
		<div class="mt-2 flex items-center justify-between text-sm">
			<span class="tabular-nums">{money(i.total)} <span class="text-muted-foreground">· {money(i.amountRemaining)} left</span></span>
			<span class="relative z-10">{@render invoiceLink(i)}</span>
		</div>
	</div>
{/snippet}

{#snippet paymentAmount(p: RequisitionPaymentRow)}
	<span class={p.type === 'REFUND' ? 'text-destructive' : ''}>{p.type === 'REFUND' ? '−' : ''}{money(Math.abs(p.amount))}</span>
{/snippet}

{#snippet paymentMobile(p: RequisitionPaymentRow)}
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-semibold">{day(p.date)} · {p.invoiceNumber}</p>
			<p class="text-sm text-muted-foreground">{p.type.charAt(0) + p.type.slice(1).toLowerCase()} · {p.method === 'PAPER' ? 'Paper / manual' : 'Stripe'}</p>
		</div>
		<span class="font-semibold tabular-nums">{@render paymentAmount(p)}</span>
	</div>
{/snippet}

{#snippet noInvoices()}
	<EmptyState
		icon={CreditCard}
		title="No invoices yet"
		description={permanentPosition
			? 'Nothing has been billed against this requisition.'
			: 'Invoices appear here once timesheets are approved.'}
	/>
{/snippet}

<Section
	title={permanentPosition ? 'Invoices and payments' : 'Invoices'}
	description={isAdmin
		? 'Every invoice raised against this requisition and the payments recorded on them.'
		: "Your placement fee invoices and the payments we've received."}
>
	<div class="space-y-6">
		{#if permanentPosition}
			<FactGrid
				facts={[
					{ label: 'Placement fee billed', value: money(summary.totalBilled) },
					{ label: 'Paid', value: money(summary.totalPaid) },
					{ label: 'Outstanding', value: money(summary.outstanding) },
					{ label: 'Requisition status', cell: reqStatus }
				]}
			/>
		{/if}

		{#if summary.unbilled}
			<Notice tone="warning" title={isAdmin ? 'Not invoiced yet' : 'Invoice on its way'}>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<span>
						{#if isAdmin}
							The placement is filled but no live invoice has been raised.
						{:else}
							Your placement fee invoice hasn't been issued yet. It will appear here once it is.
						{/if}
					</span>
					{#if isAdmin && onCreateInvoice}
						<Button size="sm" on:click={() => onCreateInvoice?.()}>Create invoice</Button>
					{/if}
				</div>
			</Notice>
		{/if}

		<div class="space-y-2">
			<h3 class="text-h4">Invoices</h3>
			{#if isAdmin && invoices.length > 0}
				<p class="text-sm text-muted-foreground">
					Voided invoices stay listed: check here before creating another so a placement isn't billed twice.
				</p>
			{/if}
			<DataTable
				rows={invoices}
				columns={invoiceColumns}
				key={(i) => i.id}
				caption="Invoices on this requisition"
				mobile={invoiceMobile}
				empty={noInvoices}
				class="shadow-none"
			/>
		</div>

		{#if invoices.length > 0}
			<div class="space-y-2">
				<h3 class="text-h4">Payment history</h3>
				{#if payments.length === 0}
					<p class="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
						No payments recorded yet.
					</p>
				{:else}
					<DataTable
						rows={payments}
						columns={paymentColumns}
						key={(p) => p.id}
						caption="Payments on this requisition"
						mobile={paymentMobile}
						class="shadow-none"
					/>
				{/if}
			</div>
		{/if}
	</div>
</Section>

{#snippet reqStatus()}
	{#if requisitionStatus}<StatusBadge status={requisitionStatus} />{:else}—{/if}
{/snippet}
