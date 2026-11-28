<script lang="ts">
	// Hand-rolled SVG sparkline (10 §6.1 interim): LayerChart isn't installed yet.
	// The number beside it is the text equivalent; this is decoration with a label.
	import type { Series } from '../types';

	let { values, label, class: className = '' }: { values: Series; label: string; class?: string } = $props();

	const W = 120;
	const H = 32;
	const PAD = 2;

	const points = $derived.by(() => {
		const nums = values.filter((v): v is number => v !== null);
		if (nums.length < 2) return [];
		const min = Math.min(...nums);
		const max = Math.max(...nums);
		const span = max - min || 1;
		const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
		// Gaps (no data that day) break the line rather than dropping to zero.
		const segments: string[][] = [];
		let current: string[] = [];
		values.forEach((v, i) => {
			if (v === null) {
				if (current.length) segments.push(current);
				current = [];
				return;
			}
			const x = PAD + i * step;
			const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
			current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
		});
		if (current.length) segments.push(current);
		return segments;
	});

	const last = $derived(points.at(-1)?.at(-1)?.split(',').map(Number));
</script>

{#if points.length}
	<svg viewBox="0 0 {W} {H}" class="h-8 w-[120px] max-w-full text-primary {className}" role="img" aria-label={label}>
		{#each points as seg}
			{#if seg.length === 1}
				{@const [x, y] = seg[0].split(',')}
				<circle cx={x} cy={y} r="1.5" fill="currentColor" />
			{:else}
				<polyline
					points={seg.join(' ')}
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{/if}
		{/each}
		{#if last}<circle cx={last[0]} cy={last[1]} r="2.5" fill="currentColor" />{/if}
	</svg>
{/if}
