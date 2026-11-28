<script lang="ts">
	// A KPI tile (10 §3.3): StatTile's layout plus what the shared StatTile lacks:
	// the window printed on the tile, a sparkline, and a failed state ("—").
	import { TrendingDown, TrendingUp } from 'lucide-svelte';
	import Hint from '$dtss/Hint.svelte';
	import { cn } from '$lib/utils';
	import { DASH } from '../format';
	import { FAILED_HINT } from '../metrics';
	import type { Series } from '../types';
	import Sparkline from './Sparkline.svelte';

	let {
		label,
		value,
		windowText,
		hint,
		failed = false,
		trend = null,
		goodWhenUp = true,
		series = [],
		seriesLabel = '',
		detail,
		href
	}: {
		label: string;
		/** Already formatted. Ignored when `failed`. */
		value: string;
		/** "this month", "right now": printed so a screenshot can't be misread. */
		windowText: string;
		hint: string;
		failed?: boolean;
		/** Whole percent vs the previous equal window; null hides it. */
		trend?: number | null;
		goodWhenUp?: boolean;
		series?: Series;
		seriesLabel?: string;
		detail?: string;
		href?: string | null;
	} = $props();

	const good = $derived(trend !== null && trend !== 0 && (trend > 0) === goodWhenUp);
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	href={href ?? undefined}
	class={cn(
		'flex min-w-0 flex-col rounded-lg border bg-card p-5 shadow-card',
		href && 'transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	)}
>
	<div class="flex items-baseline justify-between gap-2">
		<p class="text-overline uppercase text-muted-foreground"><Hint text={hint}>{label}</Hint></p>
		<span class="shrink-0 text-xs text-muted-foreground">{windowText}</span>
	</div>
	<div class="mt-3 flex items-end justify-between gap-3">
		<p class="whitespace-nowrap text-3xl font-extrabold tabular-nums">
			{#if failed}<Hint text={FAILED_HINT}>{DASH}</Hint>{:else}{value}{/if}
		</p>
		{#if !failed}<Sparkline values={series} label={seriesLabel} class="mb-1 w-24 min-w-0 shrink" />{/if}
	</div>
	<div class="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
		{#if !failed && trend !== null}
			{@const Icon = trend >= 0 ? TrendingUp : TrendingDown}
			<span
				class={cn(
					'inline-flex items-center gap-1 font-semibold',
					trend === 0 ? 'text-muted-foreground' : good ? 'text-status-positive-fg' : 'text-status-negative-fg'
				)}
			>
				<Icon class="size-4" aria-hidden="true" />
				{trend > 0 ? '+' : ''}{trend}%
			</span>
			<span>vs previous period</span>
		{/if}
		{#if detail && !failed}<span>{detail}</span>{/if}
	</div>
</svelte:element>
