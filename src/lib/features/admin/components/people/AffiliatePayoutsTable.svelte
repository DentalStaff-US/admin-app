<script lang="ts">
	import { Banknote } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { money, shortDate } from './people';

	export type PayoutRow = {
		id: string;
		cohortMonth: string | null;
		email?: string | null;
		amount: string | number | null;
		status: string;
		failureReason?: string | null;
		stripeTransferId?: string | null;
		paidAt?: Date | string | null;
	};

	/** The program page lists everyone's payouts; the detail page one affiliate's. */
	let { payouts, perAffiliate = false }: { payouts: PayoutRow[]; perAffiliate?: boolean } = $props();

	const columns = $derived<DataColumn<PayoutRow>[]>([
		{ id: 'cohort', header: 'Cohort', value: (p) => p.cohortMonth, class: 'tabular-nums' },
		...(perAffiliate ? [] : [{ id: 'affiliate', header: 'Affiliate', value: (p: PayoutRow) => p.email ?? '—' }]),
		{ id: 'amount', header: 'Amount', value: (p) => money(p.amount), numeric: true, class: 'font-semibold' },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'transfer', header: 'Transfer', cell: transferCell },
		...(perAffiliate ? [{ id: 'paid', header: 'Paid', value: (p: PayoutRow) => shortDate(p.paidAt), class: 'tabular-nums' }] : [])
	]);
</script>

{#snippet statusCell(p: PayoutRow)}
	<StatusBadge status={p.status} />
	{#if p.failureReason}<span class="mt-1 block text-xs text-destructive">{p.failureReason}</span>{/if}
{/snippet}
{#snippet transferCell(p: PayoutRow)}<code class="text-xs text-muted-foreground">{p.stripeTransferId ?? '—'}</code>{/snippet}

{#snippet mobile(p: PayoutRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold tabular-nums">{money(p.amount)} <span class="font-normal text-muted-foreground">· {p.cohortMonth}</span></p>
			{#if !perAffiliate}<p class="truncate text-sm text-muted-foreground">{p.email}</p>{/if}
			{#if p.failureReason}<p class="text-xs text-destructive">{p.failureReason}</p>{/if}
			<p class="truncate text-caption text-muted-foreground">{[p.stripeTransferId ?? 'No transfer yet', perAffiliate && p.paidAt ? `paid ${shortDate(p.paidAt)}` : null].filter(Boolean).join(' · ')}</p>
		</div>
		<div class="shrink-0 whitespace-nowrap"><StatusBadge status={p.status} /></div>
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={Banknote} title="No payouts yet" description="Payouts run on the 1st of the month after next, once a balance clears the payout minimum." />
{/snippet}

<DataTable rows={payouts} {columns} key={(p) => p.id} caption="Payouts" {empty} {mobile} />
