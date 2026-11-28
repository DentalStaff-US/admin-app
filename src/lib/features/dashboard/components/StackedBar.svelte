<script lang="ts">
	// One stacked bar with labelled segments (10 §6.2: no pies; colours are status
	// tones; every chart has a text equivalent: the legend below carries the values).
	import type { StatusTone } from '$tokens/status';
	import Hint from '$dtss/Hint.svelte';
	import { cn } from '$lib/utils';
	import { TONE_SOLID } from './tones';

	export type Segment = {
		key: string;
		label: string;
		value: number;
		tone: StatusTone;
		/** Shown instead of the raw value (e.g. money when the bar is by amount). */
		display?: string;
		/** Extra text in the legend, e.g. "$18.9k". */
		detail?: string;
		/** Tooltip on the legend label. */
		hint?: string;
		href?: string;
	};

	let {
		segments,
		label,
		class: className = ''
	}: { segments: Segment[]; label: string; class?: string } = $props();

	const total = $derived(segments.reduce((n, s) => n + s.value, 0));
	const summary = $derived(`${label}: ${segments.map((s) => `${s.label} ${s.display ?? s.value}`).join(', ')}`);
</script>

<div class={className}>
	<div class="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={summary}>
		{#if total > 0}
			{#each segments.filter((s) => s.value > 0) as s (s.key)}
				<div
					class={cn('h-full first:rounded-l-full last:rounded-r-full [&+&]:border-l-2 [&+&]:border-card', TONE_SOLID[s.tone])}
					style="width: {(s.value / total) * 100}%"
				></div>
			{/each}
		{/if}
	</div>
	<ul class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
		{#each segments as s (s.key)}
			<li class="min-w-0">
				<svelte:element
					this={s.href ? 'a' : 'span'}
					href={s.href}
					class={cn('group inline-flex min-w-0 items-baseline gap-2', s.href && 'rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
				>
					<span class={cn('size-2.5 shrink-0 self-center rounded-full', TONE_SOLID[s.tone])} aria-hidden="true"></span>
					<span class="text-muted-foreground">{#if s.hint}<Hint text={s.hint}>{s.label}</Hint>{:else}{s.label}{/if}</span>
					<span class="font-bold tabular-nums">{s.display ?? s.value}</span>
					{#if s.detail}<span class="tabular-nums text-muted-foreground">{s.detail}</span>{/if}
				</svelte:element>
			</li>
		{/each}
	</ul>
</div>
