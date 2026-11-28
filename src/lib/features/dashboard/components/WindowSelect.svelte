<script lang="ts">
	// The one window selector for the KPI band (10 §3.3). A radio group: the band
	// re-fetches its own numbers; nothing else on the page reloads.
	import { cn } from '$lib/utils';
	import type { KpiWindow } from '../types';
	import { WINDOW_OPTIONS } from '../window';

	let {
		value,
		onchange,
		disabled = false
	}: { value: KpiWindow; onchange: (w: KpiWindow) => void; disabled?: boolean } = $props();
</script>

<div role="radiogroup" aria-label="Time window for the numbers below" class="inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1">
	{#each WINDOW_OPTIONS as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			{disabled}
			onclick={() => onchange(o.value)}
			class={cn(
				'inline-flex h-7 items-center whitespace-nowrap rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
				value === o.value && 'bg-background text-foreground shadow-card'
			)}
		>
			{o.label}
		</button>
	{/each}
</div>
