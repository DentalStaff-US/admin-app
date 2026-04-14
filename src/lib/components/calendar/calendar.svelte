<script lang="ts">
	import Calendar from '@event-calendar/core';
	import TimeGrid from '@event-calendar/time-grid';
	import DayGrid from '@event-calendar/day-grid';
	import '@event-calendar/core/index.css';
	import type { CalendarEvent } from '$lib/types';
	import EventPopover from './EventPopover.svelte';

	export let events: any;
	export let selectEvent: (event: CalendarEvent) => void;

	let hoveredEvent: any = null;
	let anchorEl: HTMLElement | null = null;

	let plugins = [DayGrid, TimeGrid];
	let options = {
		view: 'dayGridMonth',
		headerToolbar: {
			start: 'prev,next today',
			center: 'title',
			end: 'dayGridMonth,timeGridWeek,timeGridDay'
		},
		events,
		views: {
			timeGridWeek: { pointer: true },
			resourceTimeGridWeek: { pointer: true }
		},
		nowIndicator: true,
		selectable: true,
		displayEventEnd: true,
		eventClick: (item: any) => {
			selectEvent(item.event);
		},
		eventMouseEnter: (info: any) => {
			hoveredEvent = info.event;
			anchorEl = info.el;
		},
		eventMouseLeave: () => {
			hoveredEvent = null;
			anchorEl = null;
		},
		eventContent: (info: any) => {
			const title = info.event.title ?? '';
			const timeText = info.timeText ?? '';
			return {
				html: `
                    <div class="ec-custom-event">
                        <span class="ec-custom-title">${title}</span>
                        <span class="ec-custom-time">${timeText}</span>
                    </div>
                `
			};
		}
	};
</script>

<Calendar {plugins} {options} />

{#if hoveredEvent && anchorEl}
	<EventPopover event={hoveredEvent} anchor={anchorEl} />
{/if}

<style>
	:global(.ec-event .ec-custom-event) {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 4px;
		overflow: hidden;
		width: 100%;
		min-width: 0;
	}

	:global(.ec-event .ec-custom-time) {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex-shrink: 1;
		min-width: 0;
		font-size: 0.8em;
	}

	:global(.ec-event .ec-custom-title) {
		white-space: nowrap;
		flex-shrink: 0; /* time never truncates, title does */
	}
</style>
