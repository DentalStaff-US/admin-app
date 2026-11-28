<script lang="ts">
	import type { Snippet } from 'svelte';
	import { TrendingDown, TrendingUp } from 'lucide-svelte';
	import type { StatusTone } from '$tokens/status';
	import { cn } from '$lib/utils';
	import Hint from './Hint.svelte';
	import IconSquare from './IconSquare.svelte';

	let {
		label,
		value,
		icon,
		href,
		tone,
		hint,
		trend,
		detail
	}: {
		label: string;
		/** Already formatted. A failed load passes "—", never 0 (10 §5). */
		value: string | number;
		icon: any;
		/** The whole tile links to exactly the set it counts. */
		href?: string;
		/** When the tile is a status count: tints the icon, never the number. */
		tone?: StatusTone;
		/** One-sentence explanation shown on hover/focus (10 §5a). */
		hint?: string;
		/** Change vs the previous equal window, in percent. */
		trend?: { percent: number; goodWhenUp?: boolean } | null;
		detail?: Snippet;
	} = $props();

	const trendGood = $derived(trend ? (trend.percent >= 0) === (trend.goodWhenUp ?? true) : false);
</script>

<!-- 03 › StatTile -->
<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	class={cn(
		'group relative block rounded-lg border bg-card p-5 shadow-card',
		href && 'transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	)}
>
	<div class="flex items-start justify-between gap-3">
		<p class="text-overline uppercase text-muted-foreground">
			{#if hint}<Hint text={hint}>{label}</Hint>{:else}{label}{/if}
		</p>
		<IconSquare {icon} tone={tone ?? 'primary'} class="size-9 [&>svg]:size-5" />
	</div>
	<p class="mt-3 text-3xl font-extrabold tabular-nums">{value}</p>
	{#if trend || detail}
		<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
			{#if trend}
				{@const Icon = trend.percent >= 0 ? TrendingUp : TrendingDown}
				<span class={cn('inline-flex items-center gap-1 font-semibold', trendGood ? 'text-status-positive-fg' : 'text-status-negative-fg')}>
					<Icon class="size-4" aria-hidden="true" />
					{trend.percent >= 0 ? '+' : ''}{trend.percent}%
				</span>
			{/if}
			{#if detail}{@render detail()}{/if}
		</div>
	{/if}
</svelte:element>
