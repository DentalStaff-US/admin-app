<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { format } from 'date-fns';
	import { AlertCircle, CreditCard, ExternalLink } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import type { RequisitionBilling } from '$lib/server/requisitions/billing';

	export let billing: RequisitionBilling;
	export let isAdmin = false;
	/** CLIENT can open /invoices/[id]; CLIENT_STAFF cannot, so they get the Stripe links. */
	export let canOpenInvoicePage = false;
	export let permanentPosition = true;
	export let requisitionStatus: string | null = null;

	const dispatch = createEventDispatcher<{ createInvoice: void }>();

	const money = (n: number) =>
		n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	const day = (d: Date | string | null) => (d ? format(new Date(d), 'MMM d, yyyy') : '—');

	$: ({ invoices, payments, summary } = billing);
</script>

<div class="space-y-6">
	{#if permanentPosition}
		<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
			<div class="rounded-lg border bg-white p-4">
				<p class="text-xs text-gray-500">Placement fee billed</p>
				<p class="text-lg font-semibold">{money(summary.totalBilled)}</p>
			</div>
			<div class="rounded-lg border bg-white p-4">
				<p class="text-xs text-gray-500">Paid</p>
				<p class="text-lg font-semibold text-emerald-700">{money(summary.totalPaid)}</p>
			</div>
			<div class="rounded-lg border bg-white p-4">
				<p class="text-xs text-gray-500">Outstanding</p>
				<p
					class="text-lg font-semibold {summary.outstanding > 0
						? 'text-amber-700'
						: 'text-gray-900'}"
				>
					{money(summary.outstanding)}
				</p>
			</div>
			<div class="rounded-lg border bg-white p-4">
				<p class="text-xs text-gray-500 mb-1">Requisition status</p>
				{#if requisitionStatus}<StatusBadge status={requisitionStatus} />{/if}
			</div>
		</div>
	{/if}

	{#if summary.unbilled}
		<div
			class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
		>
			<span class="flex items-center gap-2">
				<AlertCircle class="h-4 w-4" />
				{#if isAdmin}
					Placement filled but not yet invoiced.
				{:else}
					Your placement fee invoice hasn't been issued yet. It will appear here once it is.
				{/if}
			</span>
			{#if isAdmin}
				<Button size="sm" on:click={() => dispatch('createInvoice')}>Create invoice</Button>
			{/if}
		</div>
	{/if}

	<div>
		<h3 class="text-sm font-semibold text-gray-900 mb-2">Invoices</h3>
		{#if invoices.length === 0}
			<div class="text-center py-8 rounded-md border bg-white">
				<CreditCard class="h-10 w-10 mx-auto text-gray-300" />
				<p class="mt-2 text-sm text-gray-500">
					{#if permanentPosition}
						Nothing has been billed against this requisition.
					{:else}
						Invoices appear here once timesheets are approved.
					{/if}
				</p>
			</div>
		{:else}
			{#if isAdmin}
				<p class="text-xs text-gray-500 mb-2">
					Voided invoices stay listed — check here before creating another so a placement isn't
					billed twice.
				</p>
			{/if}
			<div class="rounded-md border overflow-x-auto bg-white">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Invoice #</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Method</Table.Head>
							<Table.Head class="text-right">Total</Table.Head>
							<Table.Head class="text-right">Paid</Table.Head>
							<Table.Head class="text-right">Remaining</Table.Head>
							<Table.Head>Due</Table.Head>
							<Table.Head>Created</Table.Head>
							<Table.Head class="w-16"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each invoices as inv (inv.id)}
							<Table.Row class={inv.status === 'void' ? 'opacity-60' : ''}>
								<Table.Cell class="font-medium">{inv.invoiceNumber}</Table.Cell>
								<Table.Cell><StatusBadge status={inv.status} /></Table.Cell>
								<Table.Cell class="text-sm text-gray-600">
									{inv.invoiceType === 'PAPER' ? 'Paper' : 'Stripe'}
								</Table.Cell>
								<Table.Cell class="text-right">{money(inv.total)}</Table.Cell>
								<Table.Cell class="text-right text-emerald-700">{money(inv.amountPaid)}</Table.Cell>
								<Table.Cell class="text-right">{money(inv.amountRemaining)}</Table.Cell>
								<Table.Cell class="text-sm text-gray-600">{day(inv.dueDate)}</Table.Cell>
								<Table.Cell class="text-sm text-gray-600">{day(inv.createdAt)}</Table.Cell>
								<Table.Cell>
									{#if isAdmin || canOpenInvoicePage}
										<Button variant="link" size="sm" class="p-0 h-auto" href={`/invoices/${inv.id}`}
											>View</Button
										>
									{:else if inv.stripeHostedUrl || inv.stripePdfUrl}
										<a
											href={inv.stripeHostedUrl ?? inv.stripePdfUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
										>
											View <ExternalLink class="h-3 w-3" />
										</a>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</div>

	{#if invoices.length > 0}
		<div>
			<h3 class="text-sm font-semibold text-gray-900 mb-2">Payment history</h3>
			{#if payments.length === 0}
				<p class="text-sm text-gray-500 rounded-md border bg-white px-4 py-6 text-center">
					No payments recorded yet.
				</p>
			{:else}
				<div class="rounded-md border overflow-x-auto bg-white">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Date</Table.Head>
								<Table.Head>Invoice #</Table.Head>
								<Table.Head>Type</Table.Head>
								<Table.Head>Method</Table.Head>
								<Table.Head class="text-right">Amount</Table.Head>
								{#if isAdmin}
									<Table.Head>Status</Table.Head>
									<Table.Head>Reference</Table.Head>
								{/if}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each payments as p (p.id)}
								<Table.Row>
									<Table.Cell class="text-sm">{day(p.date)}</Table.Cell>
									<Table.Cell class="text-sm">{p.invoiceNumber}</Table.Cell>
									<Table.Cell class="text-sm capitalize">{p.type.toLowerCase()}</Table.Cell>
									<Table.Cell class="text-sm text-gray-600">
										{p.method === 'PAPER' ? 'Paper / manual' : 'Stripe'}
									</Table.Cell>
									<Table.Cell class="text-right {p.type === 'REFUND' ? 'text-red-600' : ''}">
										{p.type === 'REFUND' ? '−' : ''}{money(Math.abs(p.amount))}
									</Table.Cell>
									{#if isAdmin}
										<Table.Cell class="text-sm capitalize">{p.status.toLowerCase()}</Table.Cell>
										<Table.Cell class="text-xs text-gray-500 font-mono">
											{p.batchNumber ?? p.reference ?? '—'}
										</Table.Cell>
									{/if}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</div>
	{/if}
</div>
