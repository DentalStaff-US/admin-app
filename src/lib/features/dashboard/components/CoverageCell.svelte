<script lang="ts">
	// One location-day on the coverage board (10 §3.2). The count is text and the
	// border style differs per state, so colour is never the only signal.
	import { cn } from '$lib/utils';
	import { FILL_STATE_LABEL, type CoverageCell } from '../coverage';

	let {
		cell,
		label,
		onopen
	}: { cell: CoverageCell; label: string; onopen: () => void } = $props();

	const STYLES = {
		filled: 'border-status-positive-border bg-status-positive-bg text-status-positive-fg',
		partial: 'border-status-pending-border bg-status-pending-bg text-status-pending-fg',
		open: 'border-dashed border-status-warning-solid bg-status-warning-bg text-status-warning-fg',
		none: ''
	} as const;
</script>

{#if cell.state === 'none'}
	<span class="flex h-10 items-center justify-center text-muted-foreground" aria-label="{label}: no shifts">·</span>
{:else}
	<button
		type="button"
		onclick={onopen}
		aria-label="{label}: {cell.filled} of {cell.total} shifts filled ({FILL_STATE_LABEL[cell.state]}). Open the day's shifts."
		class={cn(
			'flex h-10 w-full items-center justify-center rounded-md border text-sm font-bold tabular-nums transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			STYLES[cell.state]
		)}
	>
		{cell.filled}/{cell.total}
	</button>
{/if}
