<script lang="ts">
	// Receivables ageing (10 §3.4): where the money is, not just how many invoices.
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { cn } from '$lib/utils';
	import { formatMoneyTile, plural } from '../format';
	import { AGEING_HINTS, AGEING_LABELS } from '../kpis';
	import { METRICS, metricHint } from '../metrics';
	import { AGEING_BUCKETS, type Metric, type Receivables } from '../types';
	import FailedLine from './FailedLine.svelte';
	import { TONE_SOLID } from './tones';

	let { receivables }: { receivables: Metric<Receivables> } = $props();

	const TONES = { current: 'info', '1-30': 'pending', '31-60': 'warning', '60+': 'negative' } as const;
</script>

<Section title={METRICS.receivables.label} description="Open invoices by days past due, right now">
	{#snippet actions()}
		<a href={METRICS.receivables.href} class="text-sm font-semibold text-primary-dark hover:underline" aria-label="View all invoices">View all</a>
	{/snippet}
	{#if receivables.ok}
		{@const r = receivables.value}
		{@const max = Math.max(1, ...AGEING_BUCKETS.map((b) => r[b].amount))}
		<ul class="space-y-3" aria-label={metricHint('receivables')}>
			{#each AGEING_BUCKETS as b (b)}
				<li class="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
					<span class="text-muted-foreground"><Hint text={AGEING_HINTS[b]}>{AGEING_LABELS[b]}</Hint></span>
					<span class="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
						<span class={cn('block h-full rounded-full', TONE_SOLID[TONES[b]])} style="width: {(r[b].amount / max) * 100}%"></span>
					</span>
					<span class="text-right tabular-nums">
						<span class="font-bold">{formatMoneyTile(r[b].amount)}</span>
						<span class="ml-1 text-xs text-muted-foreground">{plural(r[b].count, 'invoice')}</span>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<FailedLine what="receivables" />
	{/if}
</Section>
