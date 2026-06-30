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
	import { Plus, PlusIcon, Check, ChevronsUpDown, MapPin } from 'lucide-svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	type QualifiedPro = {
		candidateId: string;
		firstName: string;
		lastName: string;
		distance?: string | number;
		disciplineAbbr?: string;
	};

	export let requisition: Requisition;
	export let company;
	export let location;
	export let form;
	// Admin-only direct-assign. When `isAdmin` and a candidate is picked, the
	// new day(s) are created FILLED and the professional is notified to verify.
	export let isAdmin = false;
	export let qualifiedProfessionals: QualifiedPro[] = [];

	let selectedCandidateId = '';
	let comboOpen = false;

	// "Show more" extension: fetch candidates outside the requisition's
	// experience-level filter on demand, then dedupe against the reductive set
	// (server filter is reductive, so the extended set is a strict superset).
	let extendedProfessionals: QualifiedPro[] = [];
	let loadingExtended = false;
	let extendedLoaded = false;
	let extendedError: string | null = null;

	$: allProfessionals = [...qualifiedProfessionals, ...extendedProfessionals];
	$: selectedPro = allProfessionals.find((p) => p.candidateId === selectedCandidateId) ?? null;

	async function loadAllExperienceCandidates() {
		if (loadingExtended || extendedLoaded) return;
		loadingExtended = true;
		extendedError = null;
		try {
			const res = await fetch(
				`/api/requisitions/${requisition.id}/qualified-candidates?includeAllExperience=true&includeOutsidePayRange=true`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const all: QualifiedPro[] = await res.json();
			const existingIds = new Set(qualifiedProfessionals.map((p) => p.candidateId));
			extendedProfessionals = all.filter((p) => !existingIds.has(p.candidateId));
			extendedLoaded = true;
		} catch (err) {
			extendedError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loadingExtended = false;
		}
	}

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
		selectedCandidateId = '';
		comboOpen = false;
		extendedProfessionals = [];
		extendedLoaded = false;
		extendedError = null;
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
		<Button builders={[builder]} class="bg-primary hover:bg-primary/90 mb-4">
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

			{#if isAdmin}
				<div class="mt-6 border-t pt-4">
					<Label class="font-semibold">Assign a professional (optional)</Label>
					<p class="text-xs text-gray-500 mt-1 mb-2">
						Admins only. Assigning marks the selected day(s) as Filled and sends the professional one
						notification to log in and verify their shift start times.
					</p>

					<Popover.Root bind:open={comboOpen}>
						<Popover.Trigger asChild let:builder>
							<Button
								builders={[builder]}
								variant="outline"
								role="combobox"
								aria-expanded={comboOpen}
								class="w-full justify-between font-normal"
							>
								{#if selectedPro}
									<span class="truncate">
										{selectedPro.firstName}
										{selectedPro.lastName}{selectedPro.distance
											? ` — ${selectedPro.distance} mi`
											: ''}
									</span>
								{:else}
									<span class="text-muted-foreground">Leave open (notify all qualified)</span>
								{/if}
								<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
							</Button>
						</Popover.Trigger>
						<Popover.Content class="w-[320px] p-0">
							<Command.Root>
								<Command.Input placeholder="Search professionals..." />
								<Command.List>
									<Command.Empty>No professional found.</Command.Empty>
									<Command.Group>
										<Command.Item
											value="leave open unassigned notify all qualified"
											onSelect={() => {
												selectedCandidateId = '';
												comboOpen = false;
											}}
										>
											<Check
												class={cn(
													'mr-2 h-4 w-4',
													selectedCandidateId === '' ? 'opacity-100' : 'opacity-0'
												)}
											/>
											Leave open (notify all qualified)
										</Command.Item>
										{#each allProfessionals as pro (pro.candidateId)}
											<Command.Item
												value={`${pro.firstName} ${pro.lastName} ${pro.disciplineAbbr ?? ''}`}
												onSelect={() => {
													selectedCandidateId = pro.candidateId;
													comboOpen = false;
												}}
											>
												<Check
													class={cn(
														'mr-2 h-4 w-4 shrink-0',
														selectedCandidateId === pro.candidateId ? 'opacity-100' : 'opacity-0'
													)}
												/>
												<div class="flex flex-col min-w-0">
													<span class="truncate">{pro.firstName} {pro.lastName}</span>
													<span class="text-xs text-muted-foreground flex items-center gap-2">
														{#if pro.distance}
															<span class="flex items-center gap-0.5">
																<MapPin class="h-3 w-3" />{pro.distance} mi
															</span>
														{/if}
														{#if pro.disciplineAbbr}<span>{pro.disciplineAbbr}</span>{/if}
													</span>
												</div>
											</Command.Item>
										{/each}
									</Command.Group>

									{#if !extendedLoaded}
										<div class="border-t p-1">
											<button
												type="button"
												class="w-full rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent disabled:opacity-50"
												on:click={loadAllExperienceCandidates}
												disabled={loadingExtended}
											>
												{loadingExtended
													? 'Loading…'
													: 'Show more — include candidates outside the pay range or experience level'}
											</button>
											{#if extendedError}
												<p class="px-2 py-1 text-xs text-red-600">Failed to load: {extendedError}</p>
											{/if}
										</div>
									{:else}
										<p class="border-t px-3 py-1.5 text-xs text-muted-foreground">
											Showing candidates outside the pay range or experience level.
										</p>
									{/if}
								</Command.List>
							</Command.Root>
						</Popover.Content>
					</Popover.Root>
				</div>
			{/if}

			<form use:enhance method="POST" action="?/addRecurrenceDays" class="mt-auto pb-4">
				<input type="hidden" name="recurrenceDays" value={JSON.stringify(finalDateValue)} />
				<input type="hidden" name="candidateId" value={selectedCandidateId} />

				<Sheet.Footer class="mt-4">
					<Sheet.Close asChild let:builder>
						<Button builders={[builder]} variant="destructiveOutline" type="button" on:click={resetForm}>
							Cancel
						</Button>
					</Sheet.Close>
					<Button
						type="submit"
						disabled={!isFormValid || $submitting}
						class="bg-primary hover:bg-primary/90"
					>
						{#if $submitting}
							{selectedCandidateId ? 'Assigning...' : 'Adding...'}
						{:else}
							{selectedCandidateId ? 'Assign & Add Days' : 'Add Days'}
						{/if}
					</Button>
				</Sheet.Footer>
			</form>
		</div>
	</Sheet.Content>
</Sheet.Root>
