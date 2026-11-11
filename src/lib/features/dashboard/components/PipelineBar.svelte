<script lang="ts">
	// The Requisition Summary re-laid as one stacked bar on the shared KPI window
	// (10 §3.4). Pricing still comes from shiftValueRule.ts.
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { formatMoneyTile } from '../format';
	import { METRICS, metricHint, metricWindowText } from '../metrics';
	import type { KpiWindow, Metric, PipelineStatusKey, ShiftPipeline } from '../types';
	import FailedLine from './FailedLine.svelte';
	import StackedBar, { type Segment } from './StackedBar.svelte';
	import { statusHint } from '../hints';

	let { pipeline, window }: { pipeline: Metric<ShiftPipeline>; window: KpiWindow } = $props();

	const ROWS: { status: PipelineStatusKey; label: string; tone: Segment['tone'] }[] = [
		{ status: 'OPEN', label: 'Open', tone: 'pending' },
		{ status: 'FILLED', label: 'Filled', tone: 'positive' },
		{ status: 'UNFULFILLED', label: 'Unfulfilled', tone: 'negative' },
		{ status: 'CANCELED', label: 'Cancelled', tone: 'neutral' }
	];

	const dollars = (cents: number) => formatMoneyTile(cents / 100);
</script>

<Section title="Shift pipeline" description="Temp shifts by status, {metricWindowText('pipelineBilling', window)} (whole period)">
	{#snippet actions()}
		<a href="/requisitions" class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all requisitions">View all</a>
	{/snippet}
	{#if pipeline.ok}
		{@const p = pipeline.value}
		{@const billing = ROWS.reduce((n, r) => n + p[r.status].billingCents, 0) - p.CANCELED.billingCents}
		{@const margin = ROWS.reduce((n, r) => n + p[r.status].marginCents, 0) - p.CANCELED.marginCents}
		<StackedBar
			label="Shifts by status"
			segments={ROWS.map((r) => ({
				key: r.status,
				label: r.label,
				value: p[r.status].count,
				tone: r.tone,
				hint: statusHint(r.status, 'admin'),
				detail: p[r.status].count ? dollars(p[r.status].billingCents) : undefined
			}))}
		/>
		<p class="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
			<span>
				<Hint text={metricHint('pipelineBilling', window)}>{METRICS.pipelineBilling.label}</Hint>
				<span class="ml-1 font-bold tabular-nums text-foreground">{dollars(billing)}</span>
			</span>
			<span>
				<Hint text={metricHint('pipelineMargin', window)}>{METRICS.pipelineMargin.label}</Hint>
				<span class="ml-1 font-bold tabular-nums text-foreground">{dollars(margin)}</span>
			</span>
			<span class="text-xs">Excludes cancelled shifts</span>
		</p>
	{:else}
		<FailedLine what="the shift pipeline" />
	{/if}
</Section>
