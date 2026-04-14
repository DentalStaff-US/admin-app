<script lang="ts">
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import '@event-calendar/core/index.css';
	import { onMount } from 'svelte';
	// import { createEvents } from '$lib/components/calendar/utils';
	import type { PageData } from './$types';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import type { CalendarEvent } from '$lib/types';
	// import { formatRecurrenceDayTimeString } from '$lib/_helpers/formatRecurrenceDayTimeString';
	// import { Avatar } from '$lib/components/ui/avatar';
	import { CalendarDays, Clock } from 'lucide-svelte';

	export let mounted = false;
	export let data: PageData;
	let selectedEvent: CalendarEvent | null = null;
	let dialogOpen: boolean = false;

	$: events = data.events;

	const selectEvent = (event: CalendarEvent) => {
		selectedEvent = event;
		dialogOpen = true;
	};

	onMount(() => {
		mounted = true;
	});
</script>

<section class="grow h-screen overflow-y-auto">
	<div class="p-6 flex flex-col gap-6">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">Calendar</h1>
	</div>
	<div class="p-4">
		{#if mounted}
			<Calendar {selectEvent} {events} />
		{/if}
	</div>
	<Dialog.Root open={dialogOpen} onOpenChange={() => (dialogOpen = !dialogOpen)}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title class="text-xl text-left">{selectedEvent?.title}</Dialog.Title>
				<Dialog.Description>
					<div class="flex items-center gap-2">
						<img
							src={selectedEvent?.extendedProps.requisition.client.companyLogo}
							class="w-10 h-10 rounded-full shadow-lg"
							alt="company logo"
						/>
						<span>{selectedEvent?.extendedProps.requisition.client.companyName}</span>
					</div>
				</Dialog.Description>
			</Dialog.Header>

			{#if selectedEvent?.extendedProps.type === 'RECURRENCE_DAY'}
				<p class="font-semibold">Date & Time</p>
				<div class="flex items-center gap-2 text-gray-500">
					<CalendarDays size={18} />
					{new Date(selectedEvent.start).toLocaleDateString()}
				</div>
				<div class="flex items-center gap-2 text-gray-500">
					<Clock size={18} />
					<span
						>{new Date(selectedEvent.start).toLocaleTimeString()} - {new Date(
							selectedEvent.end
						).toLocaleTimeString()}</span
					>
				</div>
				<Dialog.Footer>
					<a href={`/requisitions/${selectedEvent?.resourceIds?.[0]}`}>
						<Button type="button" class="ml-auto mt-4">View Requisition</Button>
					</a>
				</Dialog.Footer>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
</section>
