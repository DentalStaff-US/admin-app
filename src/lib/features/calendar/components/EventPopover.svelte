<script lang="ts">
	import { onMount } from 'svelte';
	import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { timeRange } from '../calendar';

	let { event, anchor }: { event: any; anchor: HTMLElement } = $props();

	let el: HTMLElement;
	const p = $derived(event?.extendedProps ?? {});

	onMount(() =>
		autoUpdate(anchor, el, () => {
			computePosition(anchor, el, {
				strategy: 'fixed',
				placement: 'bottom-start',
				middleware: [offset(6), flip(), shift({ padding: 8 })]
			}).then(({ x, y }) => {
				el.style.left = `${x}px`;
				el.style.top = `${y}px`;
			});
		})
	);
</script>

<!-- Hover preview; the click dialog has the same facts plus the link. -->
<div
	bind:this={el}
	role="tooltip"
	class="pointer-events-none fixed left-0 top-0 z-50 w-64 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-float"
>
	{#if p.requisition}
		<div class="flex items-start justify-between gap-2 border-b pb-2">
			<p class="font-bold">#{p.requisition.id} · {p.discipline?.name ?? 'Unknown discipline'}</p>
			<StatusBadge status={p.recurrenceDay?.status} />
		</div>
		<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-muted-foreground">Practice</dt>
			<dd class="truncate font-semibold">{p.client?.companyName ?? '—'}</dd>
			<dt class="text-muted-foreground">Location</dt>
			<dd class="truncate font-semibold">{p.location?.name ?? '—'}</dd>
			<dt class="text-muted-foreground">Time</dt>
			<dd class="font-semibold tabular-nums">{timeRange(event)}</dd>
		</dl>
	{/if}
</div>
