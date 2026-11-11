<script lang="ts">
	import { Plus, Receipt } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';

	type Row = {
		invoice: {
			id: string;
			invoiceNumber: string | null;
			amountDue: string | number | null;
			total: string | number | null;
			status: string | null;
			dueDate: Date | string | null;
			createdAt: Date | string;
		};
	};

	let { invoices, onNew }: { invoices: Row[]; onNew?: () => void } = $props();

	const money = (r: Row) =>
		Number(r.invoice.amountDue || r.invoice.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
	const day = (v: Date | string | null) => (v ? new Date(v).toLocaleDateString() : '—');

	const columns: DataColumn<Row>[] = [
		{ id: 'number', header: 'Invoice', value: (r) => r.invoice.invoiceNumber || 'Draft', class: 'whitespace-nowrap' },
		{ id: 'amount', header: 'Amount', value: money, numeric: true },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'due', header: 'Due', value: (r) => day(r.invoice.dueDate), class: 'whitespace-nowrap tabular-nums' },
		{ id: 'created', header: 'Created', value: (r) => day(r.invoice.createdAt), class: 'whitespace-nowrap tabular-nums' }
	];
</script>

{#snippet statusCell(r: Row)}<StatusBadge status={r.invoice.status} />{/snippet}

{#snippet mobile(r: Row)}
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-semibold">{r.invoice.invoiceNumber || 'Draft'}</p>
			<p class="text-sm text-muted-foreground">Due {day(r.invoice.dueDate)}</p>
		</div>
		<div class="text-right">
			<p class="font-bold tabular-nums">{money(r)}</p>
			<StatusBadge status={r.invoice.status} />
		</div>
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={Receipt} title="No invoices yet" description="Invoices from approved timesheets and one-off charges show up here.">
		{#if onNew}<Button on:click={onNew}>Create the first invoice</Button>{/if}
	</EmptyState>
{/snippet}

<Section title="Invoices" flush>
	{#snippet actions()}
		{#if onNew}<Button size="sm" variant="outline" class="gap-2" on:click={onNew}><Plus class="size-4" aria-hidden="true" />New invoice</Button>{/if}
	{/snippet}
	<DataTable
		rows={invoices}
		{columns}
		key={(r) => r.invoice.id}
		rowHref={(r) => `/invoices/${r.invoice.id}`}
		rowLabel={(r) => `Open invoice ${r.invoice.invoiceNumber ?? ''}`.trim()}
		caption="Invoices"
		{mobile}
		{empty}
		class="rounded-none border-0 shadow-none"
	/>
</Section>
