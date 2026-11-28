<script lang="ts">
	// Kept for clients/[id] (not yet moved): the calendar now lives in
	// $features/calendar, themed per 03 › Calendar.
	import { ShiftCalendar } from '$features/calendar';
	import type { CalendarEvent } from '$lib/types';

	let { events, selectEvent }: { events: any; selectEvent: (event: CalendarEvent) => void } = $props();
</script>

<ShiftCalendar events={events ?? []} {selectEvent} />
