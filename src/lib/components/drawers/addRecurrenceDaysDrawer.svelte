<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { sineIn } from 'svelte/easing';
	import { Label } from '../ui/label';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';
	import DatePicker from '../../../routes/(protected)/requisitions/[id]/date-picker.svelte';
	import { type DateValue, DateFormatter, getLocalTimeZone } from '@internationalized/date';
	import type { DateRange } from 'bits-ui';
	import type { RecurrenceDay, Requisition } from '$lib/server/database/schemas/requisition';
	import { superForm } from 'sveltekit-superforms/client';
	import {
		getUserTimezone,
		toUTCDateString,
		formatTimezoneName
	} from '$lib/_helpers/UTCTimezoneUtils';
	import { Plus, PlusIcon } from 'lucide-svelte';

	export let requisition: Requisition;
	export let company;
	export let location;
	export let form;

	const { enhance, submitting } = superForm(form, {
		onResult({ result }) {
			if (result.type === 'success') {
				isOpen = false;
			}
		},
		onUpdate({ form }) {
			if (form.message === 'success') {
				resetForm();
			}
		},
		onError(err) {
			console.error('Form submission error:', err);
		}
	});

	let multipleDays = false;
	let useSameTimeForAllDates = false;
	let selectedRawDate: DateValue | undefined;
	let selectedRawDateRange: DateRange | undefined;
	let locationTimezone = location.timezone || 'UTC';
	let localTimezoneDisplay = formatTimezoneName(locationTimezone);
	let isOpen = false;

	let sharedTimes = {
		dayStartTime: '',
		dayEndTime: '',
		lunchStartTime: '',
		lunchEndTime: ''
	};

	let perDayTimes: Record<
		string,
		{
			dayStartTime: string;
			dayEndTime: string;
			lunchStartTime: string;
			lunchEndTime: string;
		}
	> = {};

	const df = new DateFormatter('en-US', { dateStyle: 'full' });

	function resetForm() {
		multipleDays = false;
		useSameTimeForAllDates = false;
		selectedRawDate = undefined;
		selectedRawDateRange = undefined;
		perDayTimes = {};
		sharedTimes = {
			dayStartTime: '',
			dayEndTime: '',
			lunchStartTime: '',
			lunchEndTime: ''
		};
		isOpen = false;
	}

	$: operatingHours = location?.operatingHours || {};

	$: formattedDateRange = (() => {
		if (multipleDays && selectedRawDateRange?.start && selectedRawDateRange?.end) {
			const start = new Date(df.format(selectedRawDateRange.start.toDate(getLocalTimeZone())));
			const end = new Date(df.format(selectedRawDateRange.end.toDate(getLocalTimeZone())));
			return getDatesInRange(start, end);
		} else if (selectedRawDate) {
			const dateStr = df.format(selectedRawDate.toDate(getLocalTimeZone()));
			const date = new Date(dateStr);
			return [date];
		} else {
			return [];
		}
	})();

	$: filteredDates = formattedDateRange.filter((date) => {
		if (!operatingHours || Object.keys(operatingHours).length === 0) return true;
		const dayOfWeek = date.getDay();
		const dayData = operatingHours[dayOfWeek];
		if (!dayData) return true;
		return !dayData.isClosed;
	});

	// Initialize new dates, remove deselected ones, preserve existing entries
	$: {
		const currentKeys = new Set(filteredDates.map((date) => toUTCDateString(date)));

		filteredDates.forEach((date) => {
			const key = toUTCDateString(date);
			if (!perDayTimes[key]) {
				perDayTimes[key] = {
					dayStartTime: '',
					dayEndTime: '',
					lunchStartTime: '',
					lunchEndTime: ''
				};
			}
		});

		Object.keys(perDayTimes).forEach((key) => {
			if (!currentKeys.has(key)) delete perDayTimes[key];
		});

		perDayTimes = { ...perDayTimes };
	}

	$: selectedDateTimes = filteredDates.map((date) => {
		const utcDateString = toUTCDateString(date);
		return {
			date: utcDateString,
			localDate: date,
			times: useSameTimeForAllDates
				? { ...sharedTimes }
				: (perDayTimes[utcDateString] ?? {
						dayStartTime: '',
						dayEndTime: '',
						lunchStartTime: '',
						lunchEndTime: ''
					})
		};
	});

	function convertToUTCTimes(entry) {
		const localTimes = !multipleDays && selectedRawDate ? sharedTimes : entry.times;

		if (!localTimes.dayStartTime || !localTimes.dayEndTime) return null;

		return {
			date: entry.date,
			dayStartTime: localTimes.dayStartTime,
			dayEndTime: localTimes.dayEndTime,
			lunchStartTime: localTimes.lunchStartTime || '',
			lunchEndTime: localTimes.lunchEndTime || '',
			requisitionId: requisition.id
		};
	}

	$: finalDateValue = (() => {
		if (multipleDays) {
			if (useSameTimeForAllDates) {
				const converted = selectedDateTimes.map(convertToUTCTimes).filter(Boolean);
				return converted.length > 0 ? converted : null;
			} else {
				const converted = filteredDates
					.map((date) => {
						const key = toUTCDateString(date);
						const times = perDayTimes[key];
						if (!times?.dayStartTime || !times?.dayEndTime) return null;
						return {
							date: key,
							dayStartTime: times.dayStartTime,
							dayEndTime: times.dayEndTime,
							lunchStartTime: times.lunchStartTime || '',
							lunchEndTime: times.lunchEndTime || '',
							requisitionId: requisition.id
						};
					})
					.filter(Boolean);
				return converted.length > 0 ? converted : null;
			}
		} else {
			if (selectedDateTimes[0]) {
				const converted = convertToUTCTimes(selectedDateTimes[0]);
				return converted;
			}
			return null;
		}
	})();

	$: isFormValid = (() => {
		if (!finalDateValue) return false;
		if (Array.isArray(finalDateValue)) {
			return (
				finalDateValue.length > 0 &&
				finalDateValue.every((entry) => entry && entry.dayStartTime && entry.dayEndTime)
			);
		} else {
			return finalDateValue.dayStartTime && finalDateValue.dayEndTime;
		}
	})();

	function getDatesInRange(start: Date, end: Date): Date[] {
		const dates = [];
		const current = new Date(start);
		while (current <= end) {
			dates.push(new Date(current));
			current.setDate(current.getDate() + 1);
		}
		return dates;
	}

	function addDummyTimes() {
		sharedTimes = {
			dayStartTime: '09:00',
			dayEndTime: '17:00',
			lunchStartTime: '12:00',
			lunchEndTime: '13:00'
		};
	}
</script>

<Sheet.Root bind:open={isOpen}>
	<Sheet.Trigger asChild let:builder>
		<Button builders={[builder]} class="bg-blue-800 hover:bg-blue-900 mb-4">
			<PlusIcon class="w-4 h-4 mr-2" />
			Add Shifts
		</Button>
	</Sheet.Trigger>

	<Sheet.Content side="right" class="overflow-scroll flex flex-col">
		<Sheet.Header>
			<Sheet.Title>Add Workdays</Sheet.Title>
			<Sheet.Description>
				Add dates and times for workdays. Dates will respect your hours of operation and closed
				dates will be excluded.
				<small class="block mt-1 text-gray-500">
					All times will be shown in local timezone ({localTimezoneDisplay}) but stored in UTC.
				</small>
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col flex-1 mt-4 h-full">
			<div class="flex items-center gap-2 mb-4">
				<Checkbox bind:checked={multipleDays} id="multipleDays" />
				<Label for="multipleDays">Multiple Days?</Label>
			</div>

			{#if multipleDays}
				<RangeCalendar bind:value={selectedRawDateRange} class="rounded-md border w-fit" />

				{#if filteredDates.length}
					<div class="mt-4 flex items-center gap-2">
						<Checkbox bind:checked={useSameTimeForAllDates} id="useSameTime" />
						<Label for="useSameTime">Use same schedule for all days</Label>
					</div>

					{#if useSameTimeForAllDates}
						<p class="mt-4 font-semibold">All Dates:</p>
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="shared-day-start">Day Start *</Label>
								<Input
									id="shared-day-start"
									type="time"
									bind:value={sharedTimes.dayStartTime}
									required
								/>
							</div>
							<div class="space-y-2">
								<Label for="shared-day-end">Day End *</Label>
								<Input
									id="shared-day-end"
									type="time"
									bind:value={sharedTimes.dayEndTime}
									required
								/>
							</div>
							<div class="space-y-2">
								<Label for="shared-lunch-start">Lunch Start</Label>
								<Input
									id="shared-lunch-start"
									type="time"
									bind:value={sharedTimes.lunchStartTime}
								/>
							</div>
							<div class="space-y-2">
								<Label for="shared-lunch-end">Lunch End</Label>
								<Input id="shared-lunch-end" type="time" bind:value={sharedTimes.lunchEndTime} />
							</div>
						</div>
					{:else}
						{#each filteredDates as date}
							{@const key = toUTCDateString(date)}
							{#if perDayTimes[key]}
								<div class="mt-4">
									<p class="font-semibold">Date: {date.toLocaleDateString()}</p>
									<div class="grid grid-cols-2 gap-4">
										<div class="space-y-2">
											<Label for={`day-start-${key}`}>Day Start *</Label>
											<Input
												id={`day-start-${key}`}
												type="time"
												bind:value={perDayTimes[key].dayStartTime}
												required
											/>
										</div>
										<div class="space-y-2">
											<Label for={`day-end-${key}`}>Day End *</Label>
											<Input
												id={`day-end-${key}`}
												type="time"
												bind:value={perDayTimes[key].dayEndTime}
												required
											/>
										</div>
										<div class="space-y-2">
											<Label for={`lunch-start-${key}`}>Lunch Start</Label>
											<Input
												id={`lunch-start-${key}`}
												type="time"
												bind:value={perDayTimes[key].lunchStartTime}
											/>
										</div>
										<div class="space-y-2">
											<Label for={`lunch-end-${key}`}>Lunch End</Label>
											<Input
												id={`lunch-end-${key}`}
												type="time"
												bind:value={perDayTimes[key].lunchEndTime}
											/>
										</div>
									</div>
								</div>
							{/if}
						{/each}
					{/if}
				{/if}
			{:else}
				<DatePicker bind:value={selectedRawDate} />
				{#if selectedRawDate}
					<div class="grid grid-cols-2 gap-4 mt-4">
						<div class="space-y-2">
							<Label for="single-day-start">Day Start *</Label>
							<Input
								id="single-day-start"
								type="time"
								bind:value={sharedTimes.dayStartTime}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="single-day-end">Day End *</Label>
							<Input id="single-day-end" type="time" bind:value={sharedTimes.dayEndTime} required />
						</div>
						<div class="space-y-2">
							<Label for="single-lunch-start">Lunch Start</Label>
							<Input id="single-lunch-start" type="time" bind:value={sharedTimes.lunchStartTime} />
						</div>
						<div class="space-y-2">
							<Label for="single-lunch-end">Lunch End</Label>
							<Input id="single-lunch-end" type="time" bind:value={sharedTimes.lunchEndTime} />
						</div>
					</div>

					<div class="mt-4">
						<Button type="button" on:click={addDummyTimes} variant="secondary" size="sm">
							Add Default Times (9-5 with 12-1 lunch)
						</Button>
					</div>
				{/if}
			{/if}

			{#if finalDateValue && !isFormValid}
				<div class="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
					Please fill in all required fields (Day Start and Day End times)
				</div>
			{/if}

			<form use:enhance method="POST" action="?/addRecurrenceDays" class="mt-auto pb-4">
				<input type="hidden" name="recurrenceDays" value={JSON.stringify(finalDateValue)} />

				<Sheet.Footer class="mt-4">
					<Sheet.Close asChild let:builder>
						<Button builders={[builder]} variant="outline" type="button" on:click={resetForm}>
							Cancel
						</Button>
					</Sheet.Close>
					<Button
						type="submit"
						disabled={!isFormValid || $submitting}
						class="bg-blue-800 hover:bg-blue-900"
					>
						{#if $submitting}
							Adding...
						{:else}
							Add Days
						{/if}
					</Button>
				</Sheet.Footer>
			</form>
		</div>
	</Sheet.Content>
</Sheet.Root>
