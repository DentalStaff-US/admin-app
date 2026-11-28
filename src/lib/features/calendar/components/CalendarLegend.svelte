<script lang="ts">
	import type { LegendItem } from '../calendar';

	let { items }: { items: LegendItem[] } = $props();

	const DOT = {
		positive: 'bg-status-positive-solid',
		info: 'bg-status-info-solid',
		pending: 'bg-status-pending-solid',
		warning: 'bg-status-warning-solid',
		negative: 'bg-status-negative-solid',
		neutral: 'bg-status-neutral-solid'
	} as const;
</script>

<!-- 03 › Calendar: a legend is always visible, so colour is never the only cue. -->
<ul class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground" aria-label="Shift status colours">
	{#each items as item (item.status)}
		<li class="inline-flex items-center gap-1.5">
			<span class="size-2.5 rounded-full {DOT[item.tone]}" aria-hidden="true"></span>
			{item.label}
		</li>
	{/each}
</ul>
