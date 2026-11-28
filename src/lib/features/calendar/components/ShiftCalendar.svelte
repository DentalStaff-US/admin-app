<script lang="ts">
	import { Calendar, DayGrid, TimeGrid } from '@event-calendar/core';
	import '@event-calendar/core/index.css';
	import './calendar-theme.css';
	import { cn } from '$lib/utils';
	import { themeEvents, type ShiftEvent } from '../calendar';
	import EventPopover from './EventPopover.svelte';

	let {
		events,
		selectEvent,
		class: className
	}: {
		events: ShiftEvent[];
		/** Click on an event (opens the details dialog). */
		selectEvent: (event: any) => void;
		class?: string;
	} = $props();

	let hovered = $state<{ event: any; anchor: HTMLElement } | null>(null);

	const escape = (s: string) =>
		s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

	// Static options keep their identity, so a filter change only re-sets `events`
	// (the library diffs options) and the current view and date are kept.
	const base = {
		view: 'dayGridMonth',
		headerToolbar: { start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek,timeGridDay' },
		buttonText: { today: 'Today', dayGridMonth: 'Month', timeGridWeek: 'Week', timeGridDay: 'Day' },
		views: { timeGridWeek: { pointer: true } },
		dayMaxEvents: true,
		nowIndicator: true,
		displayEventEnd: true,
		eventClick: (info: any) => {
			hovered = null;
			selectEvent(info.event);
		},
		eventMouseEnter: (info: any) => (hovered = { event: info.event, anchor: info.el }),
		eventMouseLeave: () => (hovered = null),
		eventContent: (info: any) => ({
			html: `<span class="dtss-event"><span class="dtss-event-title">${escape(String(info.event.title ?? '').trim())}</span><span class="dtss-event-time">${escape(info.timeText ?? '')}</span></span>`
		})
	};
	const plugins = [DayGrid, TimeGrid];
	const options = $derived({ ...base, events: themeEvents(events) });
</script>

<div class={cn('dtss-calendar', className)}>
	<Calendar {plugins} {options} />
</div>

{#if hovered}
	<EventPopover event={hovered.event} anchor={hovered.anchor} />
{/if}
