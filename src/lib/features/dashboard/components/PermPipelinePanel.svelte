<script lang="ts">
	// Permanent pipeline (10 §3.8): open permanent requests by stage, one bar each.
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import { cn } from '$lib/utils';
	import { METRICS, metricHint } from '../metrics';
	import type { Metric, PermPipeline } from '../types';
	import FailedLine from './FailedLine.svelte';
	import { TONE_SOLID } from './tones';

	let { pipeline }: { pipeline: Metric<PermPipeline> } = $props();

	// The per-stage applicant page (/requisitions/permanent, 06) doesn't exist yet,
	// so every stage links to the requests list until it does.
	const STAGES = [
		{ key: 'open', label: 'Open requests', hint: 'Permanent requests posted and taking applicants.', tone: 'info', href: '/requisitions' },
		{ key: 'interested', label: 'Interested', hint: 'Professionals who saved an open permanent request.', tone: 'neutral', href: '/requisitions' },
		{ key: 'applied', label: 'Applied', hint: 'Applications waiting for the practice to decide.', tone: 'pending', href: '/requisitions' },
		{ key: 'recommended', label: 'Recommended', hint: 'Professionals DTSS put forward, waiting for the practice.', tone: 'pending', href: '/requisitions' },
		{ key: 'hired', label: 'Hired, fee due', hint: 'Placements approved and awaiting the placement fee.', tone: 'positive', href: '/requisitions' }
	] as const;
</script>

<Section title={METRICS.permPipeline.label} description="Open permanent requests by stage, right now">
	{#if pipeline.ok}
		{@const p = pipeline.value}
		{@const max = Math.max(1, ...STAGES.map((s) => p[s.key]))}
		<ul class="space-y-3" aria-label={metricHint('permPipeline')}>
			{#each STAGES as s (s.key)}
				<li>
					<a href={s.href} class="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 rounded-sm text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<span class="text-muted-foreground"><Hint text={s.hint}>{s.label}</Hint></span>
						<span class="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
							<span class={cn('block h-full rounded-full', TONE_SOLID[s.tone])} style="width: {(p[s.key] / max) * 100}%"></span>
						</span>
						<span class="text-right font-bold tabular-nums">{p[s.key]}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<FailedLine what="the permanent pipeline" />
	{/if}
</Section>
