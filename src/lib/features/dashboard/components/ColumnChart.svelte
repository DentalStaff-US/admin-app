<script lang="ts">
	// Hand-rolled SVG columns (10 §6.1 interim, no chart library yet). One axis,
	// thin columns with a 2px gap between stacked segments, a recessive grid and a
	// hover tooltip per column. The visually hidden table is the text equivalent.
	import { cn } from '$lib/utils';

	/** `fill` colours the SVG mark; `swatch` is the same colour as a background for the tooltip key. */
	export type ColumnSegment = { key: string; label: string; value: number; fill: string; swatch: string };
	export type Column = { key: string; label: string; segments: ColumnSegment[]; dim?: boolean };

	let {
		columns,
		label,
		format = (n: number) => String(n),
		height = 160,
		class: className = ''
	}: {
		columns: Column[];
		/** What the chart shows, for the screen-reader table caption. */
		label: string;
		format?: (n: number) => string;
		height?: number;
		class?: string;
	} = $props();

	const W = 600;
	const AXIS = 22;
	const TOP = 8;
	const GAP = 2;

	const total = (c: Column) => c.segments.reduce((n, s) => n + s.value, 0);
	const max = $derived(Math.max(0, ...columns.map(total)));
	const slot = $derived(W / Math.max(columns.length, 1));
	const barW = $derived(Math.max(4, Math.min(28, slot * 0.6)));
	const plotH = $derived(height - AXIS - TOP);
	const y = (v: number) => (max ? (v / max) * plotH : 0);
	// Label every column when they fit, otherwise every other one.
	const labelEvery = $derived(columns.length > 8 ? 2 : 1);
	const keys = $derived([...new Map(columns.flatMap((c) => c.segments.map((s) => [s.key, s]))).values()]);

	let hover = $state<number | null>(null);
</script>

<div class={cn('relative', className)}>
	<svg viewBox="0 0 {W} {height}" class="h-auto w-full overflow-visible" aria-hidden="true" onmouseleave={() => (hover = null)}>
		<line x1="0" x2={W} y1={TOP + plotH} y2={TOP + plotH} class="stroke-border" stroke-width="1" />
		<line x1="0" x2={W} y1={TOP} y2={TOP} class="stroke-border/60" stroke-width="1" stroke-dasharray="2 4" />
		<text x="0" y={TOP - 2} class="fill-muted-foreground text-[11px]">{max ? format(max) : ''}</text>
		{#each columns as c, i (c.key)}
			{@const x = i * slot + (slot - barW) / 2}
			{@const nonZero = c.segments.filter((s) => s.value > 0)}
			<g class={cn(c.dim && 'opacity-50', hover !== null && hover !== i && 'opacity-60')}>
				{#each nonZero as s, j (s.key)}
					{@const below = nonZero.slice(0, j).reduce((n, p) => n + p.value, 0)}
					{@const h = Math.max(0, y(s.value) - (j > 0 ? GAP : 0))}
					<rect
						x={x}
						y={TOP + plotH - y(below) - y(s.value)}
						width={barW}
						height={h}
						rx={j === nonZero.length - 1 ? 3 : 0}
						class={s.fill}
					/>
				{/each}
			</g>
			<!-- Hit target wider and taller than the mark. -->
			<rect
				x={i * slot}
				y={TOP}
				width={slot}
				height={plotH}
				fill="transparent"
				role="presentation"
				onmouseenter={() => (hover = i)}
			/>
			{#if i % labelEvery === 0 || i === columns.length - 1}
				<text x={x + barW / 2} y={height - 6} text-anchor="middle" class="fill-muted-foreground text-[11px]">{c.label}</text>
			{/if}
		{/each}
	</svg>

	{#if hover !== null && columns[hover]}
		{@const c = columns[hover]}
		<div
			class="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-card"
			style="left: {Math.min(Math.max(((hover + 0.5) / columns.length) * 100, 12), 88)}%"
		>
			<p class="font-semibold">{c.label}</p>
			{#each c.segments as s (s.key)}
				<p class="flex items-center justify-between gap-3">
					<span class="flex items-center gap-1.5"><span class={cn('size-2 rounded-sm', s.swatch)}></span>{s.label}</span>
					<span class="font-semibold tabular-nums">{format(s.value)}</span>
				</p>
			{/each}
		</div>
	{/if}

	<table class="sr-only">
		<caption>{label}</caption>
		<thead><tr><th scope="col">Week</th>{#each keys as k (k.key)}<th scope="col">{k.label}</th>{/each}</tr></thead>
		<tbody>
			{#each columns as c (c.key)}
				<tr>
					<th scope="row">{c.label}</th>
					{#each keys as k (k.key)}<td>{format(c.segments.find((s) => s.key === k.key)?.value ?? 0)}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
