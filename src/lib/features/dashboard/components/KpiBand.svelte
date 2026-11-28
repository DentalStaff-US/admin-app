<script lang="ts">
	import { formatDuration, formatMoneyTile, formatPercent, percentChange, plural } from '../format';
	import { METRICS, metricHint, metricWindowText } from '../metrics';
	import type { AdminKpis } from '../types';
	import KpiTile from './KpiTile.svelte';

	let { kpis }: { kpis: AdminKpis } = $props();

	const w = $derived(kpis.window);
	const pct = (v: number | null) => (v === null ? 'n/a' : formatPercent(v));
	const trendLabel = (name: string, values: (number | null)[], fmt: (n: number) => string) => {
		const nums = values.filter((v): v is number => v !== null);
		if (nums.length < 2) return '';
		return `${name} by day, ${metricWindowText('fillRate', w)}: from ${fmt(nums[0])} to ${fmt(nums.at(-1)!)}`;
	};
</script>

<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
	{#if kpis.fillRate.ok}
		{@const v = kpis.fillRate.value}
		<KpiTile
			label={METRICS.fillRate.label}
			value={pct(v.current)}
			windowText={metricWindowText('fillRate', w)}
			hint={metricHint('fillRate', w)}
			trend={v.current === null || v.previous === null ? null : Math.round((v.current - v.previous) * 100)}
			series={v.series}
			seriesLabel={trendLabel('Fill rate', v.series, formatPercent)}
			detail={v.current === null ? 'No shifts have started yet' : undefined}
		/>
	{:else}
		<KpiTile label={METRICS.fillRate.label} value="" failed windowText={metricWindowText('fillRate', w)} hint={metricHint('fillRate', w)} />
	{/if}

	{#if kpis.timeToFill.ok}
		{@const v = kpis.timeToFill.value}
		<KpiTile
			label={METRICS.timeToFill.label}
			value={v.current === null ? 'n/a' : formatDuration(v.current)}
			windowText={metricWindowText('timeToFill', w)}
			hint={metricHint('timeToFill', w)}
			trend={percentChange(v.current, v.previous)}
			goodWhenUp={false}
			series={v.series}
			seriesLabel={trendLabel('Median time to fill', v.series, formatDuration)}
			detail={v.sample ? `${plural(v.sample, 'shift')} filled` : 'No shifts filled yet'}
		/>
	{:else}
		<KpiTile label={METRICS.timeToFill.label} value="" failed windowText={metricWindowText('timeToFill', w)} hint={metricHint('timeToFill', w)} />
	{/if}

	{#if kpis.billed.ok}
		{@const v = kpis.billed.value}
		<KpiTile
			label={METRICS.billed.label}
			value={formatMoneyTile(v.current ?? 0)}
			windowText={metricWindowText('billed', w)}
			hint={metricHint('billed', w)}
			href={METRICS.billed.href}
			trend={percentChange(v.current, v.previous)}
			series={v.series.map((x) => x ?? 0)}
			seriesLabel={trendLabel('Billed', v.series.map((x) => x ?? 0), formatMoneyTile)}
		/>
	{:else}
		<KpiTile label={METRICS.billed.label} value="" failed windowText={metricWindowText('billed', w)} hint={metricHint('billed', w)} />
	{/if}

	{#if kpis.wagesOwed.ok}
		{@const v = kpis.wagesOwed.value}
		<KpiTile
			label={METRICS.wagesOwed.label}
			value={formatMoneyTile(v.amount)}
			windowText={metricWindowText('wagesOwed', w)}
			hint={metricHint('wagesOwed', w)}
			href={METRICS.wagesOwed.href}
			detail={plural(v.count, 'timesheet')}
		/>
	{:else}
		<KpiTile label={METRICS.wagesOwed.label} value="" failed windowText={metricWindowText('wagesOwed', w)} hint={metricHint('wagesOwed', w)} />
	{/if}
</div>
