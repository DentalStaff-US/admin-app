<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';
	import { formatInTimeZone } from 'date-fns-tz';

	export let event: any;
	export let anchor: HTMLElement;

	let popoverEl: HTMLElement;
	let cleanup: () => void;

	$: requisition = event?.extendedProps?.requisition;
	$: recurrenceDay = event?.extendedProps?.recurrenceDay;
	$: discipline = event?.extendedProps?.discipline;
	$: client = event?.extendedProps?.client;
	$: location = event?.extendedProps?.location;

	onMount(() => {
		cleanup = autoUpdate(anchor, popoverEl, () => {
			computePosition(anchor, popoverEl, {
				placement: 'bottom-start',
				middleware: [
					offset(6),
					flip(), // flips to top if not enough space below
					shift({ padding: 8 }) // keeps it within viewport with 8px margin
				]
			}).then(({ x, y }) => {
				popoverEl.style.left = `${x}px`;
				popoverEl.style.top = `${y}px`;
			});
		});
	});

	onDestroy(() => {
		cleanup?.();
	});
</script>

<div bind:this={popoverEl} class="event-popover" role="tooltip">
	{#if requisition}
		<div class="popover-header">
			#{requisition.id} - {discipline?.name ?? 'Unknown Discipline'}
		</div>
		<div class="popover-row">
			<span class="label">Client</span>
			<span class="value text-muted-foreground">{client.companyName}</span>
		</div>
		<div class="popover-row">
			<span class="label">Location</span>
			<span class="value text-muted-foreground">{location.name}</span>
		</div>
		<div class="popover-row">
			<span class="label">Status</span>
			<span class="value text-muted-foreground">{recurrenceDay?.status ?? '—'}</span>
		</div>
		<div class="popover-row">
			<span class="label">Start</span>
			<span class="value text-muted-foreground">
				{formatInTimeZone(
					new Date(recurrenceDay.dayStart),
					requisition.referenceTimezone,
					'h:mm a'
				)}
			</span>
		</div>
		<div class="popover-row">
			<span class="label">End</span>
			<span class="value text-muted-foreground">
				{formatInTimeZone(new Date(recurrenceDay.dayEnd), requisition.referenceTimezone, 'h:mm aa')}
			</span>
		</div>
		<!-- Add more fields here -->
	{/if}
</div>

<style>
	.event-popover {
		position: fixed; /* fixed so it's relative to viewport, not document */
		z-index: 50;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		padding: 10px 14px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
		min-width: 220px;
		pointer-events: none;
		font-size: 0.875rem;
	}

	.popover-header {
		font-weight: 600;
		font-size: 0.9rem;
		margin-bottom: 6px;
		color: #111827;
		border-bottom: 1px solid #f3f4f6;
		padding-bottom: 6px;
	}

	.popover-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 2px 0;
	}

	.label {
		color: #6b7280;
		font-weight: 500;
	}

	.value {
		/* color: #111827; */
		font-size: 0.8rem;
	}
</style>
