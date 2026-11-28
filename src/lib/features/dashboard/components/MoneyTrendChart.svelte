<script lang="ts">
	// Billed and margin by week as two small single-series charts on one card:
	// same unit, but two measures, so they don't share an axis (10 §6.2).
	import Section from '$dtss/Section.svelte';
	import { formatMoneyTile } from '../format';
	import type { MoneyPoint } from '../trends';
	import ColumnChart, { type Column } from './ColumnChart.svelte';

	let { points }: { points: MoneyPoint[] } = $props();

	const columns = (key: 'billed' | 'margin', label: string, fill: string, swatch: string): Column[] =>
		points.map((p) => ({ key: p.week, label: p.label, segments: [{ key, label, value: p[key], fill, swatch }] }));
	const billedTotal = $derived(points.reduce((n, p) => n + p.billed, 0));
	const marginTotal = $derived(points.reduce((n, p) => n + p.margin, 0));
</script>

<Section title="Billed & margin by week" description="Last 12 weeks. Margin is the platform fee on shifts worked that week (estimate).">
	{#snippet actions()}<a href="/invoices" class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all invoices">View all</a>{/snippet}
	<div class="space-y-5">
		<div>
			<p class="flex items-baseline justify-between gap-2 text-sm">
				<span class="font-semibold">Billed</span>
				<span class="font-extrabold tabular-nums">{formatMoneyTile(billedTotal)}</span>
			</p>
			<ColumnChart columns={columns('billed', 'Billed', 'fill-primary', 'bg-primary')} label="Billed by week" format={formatMoneyTile} height={120} class="mt-1" />
		</div>
		<div>
			<p class="flex items-baseline justify-between gap-2 text-sm">
				<span class="font-semibold">Margin (est.)</span>
				<span class="font-extrabold tabular-nums">{formatMoneyTile(marginTotal)}</span>
			</p>
			<ColumnChart columns={columns('margin', 'Margin', 'fill-primary', 'bg-primary')} label="Estimated margin by week" format={formatMoneyTile} height={100} class="mt-1" />
		</div>
	</div>
</Section>
