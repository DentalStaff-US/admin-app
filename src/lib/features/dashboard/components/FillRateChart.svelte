<script lang="ts">
	// Weekly fill rate as a 2px line on a fixed 0–100% axis, with a crosshair
	// tooltip. Weeks with no finished shifts break the line rather than reading 0.
	import Section from '$dtss/Section.svelte';
	import Hint from '$dtss/Hint.svelte';
	import type { FillRatePoint } from '../trends';
	import { DASH } from '../format';

	let { points }: { points: FillRatePoint[] } = $props();

	const W = 600;
	const H = 170;
	const TOP = 10;
	const AXIS = 22;
	const LEFT = 34;
	const plotH = H - TOP - AXIS;
	const plotW = W - LEFT - 8;

	const pct = (r: number | null) => (r === null ? DASH : `${Math.round(r * 100)}%`);
	const x = (i: number) => LEFT + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
	const y = (r: number) => TOP + plotH - r * plotH;

	const segments = $derived.by(() => {
		const out: string[][] = [];
		let cur: string[] = [];
		points.forEach((p, i) => {
			if (p.rate === null) {
				if (cur.length) out.push(cur);
				cur = [];
				return;
			}
			cur.push(`${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`);
		});
		if (cur.length) out.push(cur);
		return out;
	});
	const latest = $derived([...points].reverse().find((p) => p.rate !== null) ?? null);

	let hover = $state<number | null>(null);
	function onmove(e: MouseEvent) {
		const svg = e.currentTarget as SVGSVGElement;
		const box = svg.getBoundingClientRect();
		const px = ((e.clientX - box.left) / box.width) * W;
		const i = Math.round(((px - LEFT) / plotW) * (points.length - 1));
		hover = Math.min(Math.max(i, 0), points.length - 1);
	}
</script>

<Section title="Fill rate by week" description="Filled ÷ shifts that started (filled or unfulfilled), last 12 weeks.">
	<div class="flex items-baseline gap-2">
		<span class="text-2xl font-extrabold tabular-nums">{pct(latest?.rate ?? null)}</span>
		<span class="text-sm text-muted-foreground">
			<Hint text="The most recent week with finished shifts.">{latest ? `week of ${latest.label}` : 'no finished shifts yet'}</Hint>
		</span>
	</div>
	<div class="relative mt-3">
		<svg viewBox="0 0 {W} {H}" class="h-auto w-full overflow-visible" aria-hidden="true" onmousemove={onmove} onmouseleave={() => (hover = null)} role="presentation">
			{#each [0, 0.5, 1] as tick}
				<line x1={LEFT} x2={W - 8} y1={y(tick)} y2={y(tick)} class={tick === 0 ? 'stroke-border' : 'stroke-border/60'} stroke-width="1" stroke-dasharray={tick === 0 ? undefined : '2 4'} />
				<text x={LEFT - 6} y={y(tick) + 4} text-anchor="end" class="fill-muted-foreground text-[11px]">{tick * 100}%</text>
			{/each}
			{#each segments as seg}
				{#if seg.length === 1}
					{@const [cx, cy] = seg[0].split(',')}
					<circle {cx} {cy} r="4" class="fill-primary" />
				{:else}
					<polyline points={seg.join(' ')} fill="none" class="stroke-primary" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
				{/if}
			{/each}
			{#each points as p, i (p.week)}
				{#if i % 2 === (points.length - 1) % 2}
					<text x={x(i)} y={H - 6} text-anchor="middle" class="fill-muted-foreground text-[11px]">{p.label}</text>
				{/if}
			{/each}
			{#if hover !== null}
				{@const p = points[hover]}
				<line x1={x(hover)} x2={x(hover)} y1={TOP} y2={TOP + plotH} class="stroke-foreground/30" stroke-width="1" />
				{#if p.rate !== null}<circle cx={x(hover)} cy={y(p.rate)} r="5" class="fill-primary stroke-card" stroke-width="2" />{/if}
			{/if}
		</svg>
		{#if hover !== null}
			{@const p = points[hover]}
			<div
				class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-card"
				style="left: {Math.min(Math.max((x(hover) / W) * 100, 12), 88)}%"
			>
				<p class="font-semibold">Week of {p.label}</p>
				<p><span class="font-semibold tabular-nums">{pct(p.rate)}</span>{p.total ? ` · ${p.filled} of ${p.total} shifts` : ' · no finished shifts'}</p>
			</div>
		{/if}
		<table class="sr-only">
			<caption>Fill rate by week</caption>
			<thead><tr><th scope="col">Week</th><th scope="col">Fill rate</th><th scope="col">Filled</th><th scope="col">Finished shifts</th></tr></thead>
			<tbody>
				{#each points as p (p.week)}<tr><th scope="row">{p.label}</th><td>{pct(p.rate)}</td><td>{p.filled}</td><td>{p.total}</td></tr>{/each}
			</tbody>
		</table>
	</div>
</Section>
