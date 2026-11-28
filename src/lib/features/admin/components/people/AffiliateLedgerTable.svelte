<script lang="ts">
	import { BookOpen } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { money, shortDate } from './people';

	export type LedgerRow = {
		id: string;
		revenueAt: Date | string | null;
		sourceType: string | null;
		grossAmount: string | number | null;
		commissionAmount: string | number | null;
		status: string;
		cohortMonth: string | null;
		reversedReason?: string | null;
		notes?: string | null;
	};

	let { ledger }: { ledger: LedgerRow[] } = $props();

	const negative = (e: LedgerRow) => Number(e.commissionAmount) < 0;

	const columns: DataColumn<LedgerRow>[] = [
		{ id: 'date', header: 'Date', value: (e) => shortDate(e.revenueAt), class: 'tabular-nums whitespace-nowrap' },
		{ id: 'source', header: 'Source', cell: sourceCell },
		{ id: 'base', header: 'Base', value: (e) => money(e.grossAmount), numeric: true },
		{ id: 'commission', header: 'Commission', cell: commissionCell, numeric: true },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'cohort', header: 'Cohort', value: (e) => e.cohortMonth, class: 'tabular-nums' },
		{ id: 'note', header: 'Note', value: (e) => e.reversedReason ?? e.notes ?? '', class: 'text-xs text-muted-foreground' }
	];
</script>

{#snippet sourceCell(e: LedgerRow)}<code class="text-xs">{e.sourceType ?? '—'}</code>{/snippet}
<!-- Debits (clawbacks, negative adjustments) read in the warning tone, with a sign. -->
{#snippet commissionCell(e: LedgerRow)}
	<span class={negative(e) ? 'font-semibold text-status-warning-fg' : 'font-semibold'}>{money(e.commissionAmount)}</span>
{/snippet}
{#snippet statusCell(e: LedgerRow)}<StatusBadge status={e.status} />{/snippet}

{#snippet mobile(e: LedgerRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="tabular-nums">{@render commissionCell(e)} <span class="text-sm text-muted-foreground">on {money(e.grossAmount)}</span></p>
			<p class="text-sm text-muted-foreground">{shortDate(e.revenueAt)} · {e.sourceType} · cohort {e.cohortMonth}</p>
			{#if e.reversedReason ?? e.notes}<p class="text-xs text-muted-foreground">{e.reversedReason ?? e.notes}</p>{/if}
		</div>
		<div class="shrink-0 whitespace-nowrap"><StatusBadge status={e.status} /></div>
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={BookOpen} title="No commission yet" description="Commission is recorded here as referred accounts' temp-shift invoices are paid." />
{/snippet}

<DataTable rows={ledger} {columns} key={(e) => e.id} caption="Commission ledger" {empty} {mobile} />
