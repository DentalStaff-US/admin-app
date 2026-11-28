<script lang="ts">
	/** Line items as a DataTable (right-aligned, tabular amounts) with the totals under it. */
	import DataTable from '$dtss/DataTable.svelte';
	import Section from '$dtss/Section.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { usd } from '$features/timesheets';
	import type { LineItemRow } from '../invoices';

	let {
		items,
		subtotal,
		tax,
		total,
		paid,
		remaining
	}: { items: LineItemRow[]; subtotal: number; tax: number; total: number; paid: number; remaining: number } = $props();

	const columns: DataColumn<LineItemRow>[] = [
		{ id: 'description', header: 'Description', value: (r) => r.description, class: 'font-semibold' },
		{ id: 'quantity', header: 'Qty', value: (r) => r.quantity, numeric: true },
		{ id: 'rate', header: 'Rate', value: (r) => usd(r.rate), numeric: true },
		{ id: 'amount', header: 'Amount', value: (r) => usd(r.amount), numeric: true, class: 'font-semibold' }
	];
</script>

<Section title="Line items" flush>
	<DataTable rows={items} {columns} key={(r) => r.key} caption="Invoice line items" class="rounded-none border-0 shadow-none" />
	<dl class="space-y-2 border-t px-5 py-4 text-sm sm:px-6">
		<div class="flex justify-between gap-3">
			<dt class="text-muted-foreground">Subtotal <span class="text-xs">(includes platform fees)</span></dt>
			<dd class="tabular-nums">{usd(subtotal)}</dd>
		</div>
		{#if tax > 0}
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">Tax</dt>
				<dd class="tabular-nums">{usd(tax)}</dd>
			</div>
		{/if}
		<div class="flex justify-between gap-3 border-t pt-2 text-base font-bold">
			<dt>Total</dt>
			<dd class="tabular-nums">{usd(total)}</dd>
		</div>
		{#if paid > 0}
			<div class="flex justify-between gap-3">
				<dt class="text-muted-foreground">Paid</dt>
				<dd class="tabular-nums text-status-positive-fg">−{usd(paid)}</dd>
			</div>
			<div class="flex justify-between gap-3 font-bold">
				<dt>Balance due</dt>
				<dd class="tabular-nums {remaining > 0 ? 'text-status-warning-fg' : ''}">{usd(remaining)}</dd>
			</div>
		{/if}
	</dl>
</Section>
