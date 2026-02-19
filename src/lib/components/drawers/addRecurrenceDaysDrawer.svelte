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
		localTimeToUTC,
		utcToLocalTime,
		toUTCDateString,
		formatTimezoneName
	} from '$lib/_helpers/UTCTimezoneUtils';
	import { Plus, PlusIcon } from 'lucide-svelte';

	// Props
	export let requisition: Requisition;
	export let company;
	export let location;
	export let form; // From parent

	const { enhance, submitting } = superForm(form, {
		onResult({ result }) {
			console.log('Form submission result received');
			if (result.type === 'success') {
				isOpen = false;
			}
		},
		onSubmit(input) {
			console.log('Submitting form with:', input);
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

	// Form state
	let multipleDays = false;
	let useSameTimeForAllDates = false;
	let selectedRawDate: DateValue | undefined;
	let selectedRawDateRange: DateRange | undefined;
	// let userTimezone = getUserTimezone();
	let locationTimezone = location.timezone || 'UTC';
	let localTimezoneDisplay = formatTimezoneName(locationTimezone);
	let isOpen = false; // ✅ Track sheet state

	// Times in local timezone
	let sharedTimes = {
		dayStartTime: '',
		dayEndTime: '',
		lunchStartTime: '',
		lunchEndTime: ''
	};

	const df = new DateFormatter('en-US', { dateStyle: 'full' });

	// ✅ Helper to reset form
	function resetForm() {
		multipleDays = false;
		useSameTimeForAllDates = false;
		selectedRawDate = undefined;
		selectedRawDateRange = undefined;
		sharedTimes = {
			dayStartTime: '',
			dayEndTime: '',
			lunchStartTime: '',
			lunchEndTime: ''
		};
		isOpen = false;
	}

	// Derived values
	$: operatingHours = location?.operatingHours || {};

	$: formattedDateRange = (() => {
		if (multipleDays && selectedRawDateRange?.start && selectedRawDateRange?.end) {
			const start = new Date(df.format(selectedRawDateRange.start.toDate(getLocalTimeZone())));
			const end = new Date(df.format(selectedRawDateRange.end.toDate(getLocalTimeZone())));
			console.log('Multiple days - start:', start, 'end:', end);
			return getDatesInRange(start, end);
		} else if (selectedRawDate) {
			const dateStr = df.format(selectedRawDate.toDate(getLocalTimeZone()));
			const date = new Date(dateStr);
			console.log('Single date - formatted string:', dateStr, 'parsed date:', date);
			return [date];
		} else {
			console.log('No date selected');
			return [];
		}
	})();

	$: filteredDates = formattedDateRange.filter((date) => {
		// If no operating hours, include all dates
		if (!operatingHours || Object.keys(operatingHours).length === 0) {
			return true;
		}

		const dayOfWeek = date.getDay();
		const dayData = operatingHours[dayOfWeek];

		// If this specific day has no data, include it
		if (!dayData) {
			return true;
		}

		// Otherwise, filter based on isClosed
		return !dayData.isClosed;
	});

	$: selectedDateTimes = filteredDates.map((date) => {
		const utcDateString = toUTCDateString(date);

		return {
			date: utcDateString,
			localDate: date,
			times: useSameTimeForAllDates
				? { ...sharedTimes }
				: {
						dayStartTime: '',
						dayEndTime: '',
						lunchStartTime: '',
						lunchEndTime: ''
					}
		};
	});

	// Convert local times to UTC
	function convertToUTCTimes(entry) {
		const localTimes = !multipleDays && selectedRawDate ? sharedTimes : entry.times;

		if (!localTimes.dayStartTime || !localTimes.dayEndTime) {
			return null;
		}

		// Just send the raw times - let the backend handle conversion!
		return {
			date: entry.date,
			dayStartTime: localTimes.dayStartTime, // Keep as-is (e.g., "09:00")
			dayEndTime: localTimes.dayEndTime, // Keep as-is (e.g., "17:00")
			lunchStartTime: localTimes.lunchStartTime || '',
			lunchEndTime: localTimes.lunchEndTime || '',
			requisitionId: requisition.id
		};
	}

	// ✅ Improved final value calculation
	$: finalDateValue = (() => {
		if (multipleDays) {
			const converted = selectedDateTimes.map(convertToUTCTimes).filter(Boolean);
			return converted.length > 0 ? converted : null;
		} else {
			if (selectedDateTimes[0]) {
				const converted = convertToUTCTimes(selectedDateTimes[0]);
				return converted;
			}
			return null;
		}
	})();

	// ✅ Form submission validation
	$: isFormValid = (() => {
		if (!finalDateValue) {
			console.log('Form invalid: finalDateValue is null');
			return false;
		}

		// Check if we have at least one valid entry
		if (Array.isArray(finalDateValue)) {
			return (
				finalDateValue.length > 0 &&
				finalDateValue.every((entry) => entry && entry.dayStartTime && entry.dayEndTime)
			);
		} else {
			return finalDateValue.dayStartTime && finalDateValue.dayEndTime;
		}
	})();

	// ✅ Debug logging
	$: {
		console.log('Form validation state:', {
			multipleDays,
			selectedRawDate: selectedRawDate?.toString(),
			selectedRawDateRange: selectedRawDateRange?.start?.toString(),
			filteredDates: filteredDates.length,
			selectedDateTimes: selectedDateTimes.length,
			sharedTimes,
			finalDateValue,
			isFormValid
		});
	}

	$: {
		console.log('=== DATE SELECTION DEBUG ===');
		console.log('1. multipleDays:', multipleDays);
		console.log('2. selectedRawDate:', selectedRawDate);
		console.log('3. selectedRawDate toString:', selectedRawDate?.toString());

		if (selectedRawDate) {
			const localDate = selectedRawDate.toDate(getLocalTimeZone());
			console.log('4. selectedRawDate.toDate():', localDate);
			console.log('5. df.format():', df.format(localDate));
		}

		console.log('6. formattedDateRange:', formattedDateRange);
		console.log('7. filteredDates:', filteredDates);
		console.log('8. selectedDateTimes:', selectedDateTimes);
		console.log('========================');
	}

	// Helper functions
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
						{#each selectedDateTimes as dateEntry}
							<div class="mt-4">
								<p class="font-semibold">Date: {dateEntry.localDate.toLocaleDateString()}</p>
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label for={`day-start-${dateEntry.date}`}>Day Start *</Label>
										<Input
											id={`day-start-${dateEntry.date}`}
											type="time"
											bind:value={dateEntry.times.dayStartTime}
											required
										/>
									</div>
									<div class="space-y-2">
										<Label for={`day-end-${dateEntry.date}`}>Day End *</Label>
										<Input
											id={`day-end-${dateEntry.date}`}
											type="time"
											bind:value={dateEntry.times.dayEndTime}
											required
										/>
									</div>
									<div class="space-y-2">
										<Label for={`lunch-start-${dateEntry.date}`}>Lunch Start</Label>
										<Input
											id={`lunch-start-${dateEntry.date}`}
											type="time"
											bind:value={dateEntry.times.lunchStartTime}
										/>
									</div>
									<div class="space-y-2">
										<Label for={`lunch-end-${dateEntry.date}`}>Lunch End</Label>
										<Input
											id={`lunch-end-${dateEntry.date}`}
											type="time"
											bind:value={dateEntry.times.lunchEndTime}
										/>
									</div>
								</div>
							</div>
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

			<!-- ✅ Show validation error -->
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
