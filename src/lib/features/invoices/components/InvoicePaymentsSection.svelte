<script lang="ts">
	/**
	 * Admin payment history: the paper ledger, or Stripe's per-payment history
	 * read live from Stripe. A ledger, so amounts sit right-aligned.
	 */
	import { CreditCard } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { usd } from '$features/timesheets';
	import type { PaperTransaction, StripePayment } from '../invoices';


	let {
		paper,
		transactions,
		stripePayments,
		paidAt,
		total,
		amountPaid,
		remaining,
		canRecord,
		onRecord
	}: {
		paper: boolean;
		transactions: PaperTransaction[];
		stripePayments: StripePayment[];
		paidAt: string | Date | null;
		total: number;
		amountPaid: number;
		remaining: number;
		canRecord: boolean;
		onRecord: () => void;
	} = $props();

	type Line = { id: string; label: string; sub: string; notes?: string | null; amount: string; tone: 'in' | 'out' | 'neutral' };

	const when = (d: string | Date) =>
		new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

	const lines = $derived<Line[]>(
		paper
			? transactions.map((tx) => ({
					id: tx.id,
					label:
						(tx.details?.reversal ? 'Reversal' : tx.transactionType === 'PAYMENT' ? 'Payment' : tx.transactionType === 'REFUND' ? 'Refund' : 'Adjustment') +
						(tx.status !== 'SUCCESSFUL' ? ` · ${tx.status.toLowerCase()}` : ''),
					sub: [when(tx.createdAt), tx.batchNumber ? `Batch ${tx.batchNumber}` : null].filter(Boolean).join(' · '),
					notes: tx.details?.notes,
					amount: `${tx.transactionType === 'PAYMENT' ? '+' : tx.transactionType === 'REFUND' ? '−' : ''}${usd(parseFloat(tx.amount))}`,
					tone: tx.transactionType === 'PAYMENT' ? 'in' : tx.transactionType === 'REFUND' ? 'out' : 'neutral'
				}))
			: stripePayments.map((p) => ({
					id: p.id,
					label: 'Payment',
					sub: [when(p.paidAt), p.reference].filter(Boolean).join(' · '),
					amount: `+${usd(p.amount)}`,
					tone: 'in'
				}))
	);
</script>

<Section title="Payments" description={paper ? 'Recorded by hand for this paper invoice.' : 'Read live from Stripe.'} flush>
	{#if lines.length > 0}
		<ul class="divide-y">
			{#each lines as line (line.id)}
				<li class="flex items-start justify-between gap-4 px-5 py-3 sm:px-6">
					<div class="min-w-0">
						<p class="font-semibold">{line.label}</p>
						<p class="text-sm text-muted-foreground">{line.sub}</p>
						{#if line.notes}<p class="mt-1 whitespace-pre-line text-sm">{line.notes}</p>{/if}
					</div>
					<p class={cn('shrink-0 font-semibold tabular-nums', line.tone === 'in' && 'text-status-positive-fg', line.tone === 'out' && 'text-status-negative-fg')}>
						{line.amount}
					</p>
				</li>
			{/each}
		</ul>
		<dl class="space-y-1 border-t bg-muted/50 px-5 py-3 text-sm sm:px-6">
			<div class="flex justify-between"><dt class="text-muted-foreground">Total paid</dt><dd class="font-semibold tabular-nums">{usd(amountPaid)}</dd></div>
			<div class="flex justify-between font-bold">
				<dt>{remaining > 0 ? 'Balance remaining' : 'Paid in full'}</dt>
				<dd class="tabular-nums {remaining > 0 ? 'text-status-warning-fg' : 'text-status-positive-fg'}">{usd(remaining)}</dd>
			</div>
		</dl>
	{:else if !paper && paidAt}
		<div class="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
			<div>
				<p class="font-semibold">Payment received</p>
				<p class="text-sm text-muted-foreground">{when(paidAt)}</p>
			</div>
			<p class="font-semibold tabular-nums text-status-positive-fg">{usd(total)}</p>
		</div>
	{:else}
		<div class="p-4 sm:p-6">
			<EmptyState icon={CreditCard} title={paper ? 'No transactions yet' : 'No payments yet'} description={paper ? 'Record a payment when the check or transfer arrives.' : 'Payments appear here when Stripe collects them.'}>
				{#if paper && canRecord}<Button variant="outline" on:click={onRecord}>Record first transaction</Button>{/if}
			</EmptyState>
		</div>
	{/if}
</Section>
