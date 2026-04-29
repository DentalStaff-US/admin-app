<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { ChevronDown } from 'lucide-svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import {
		Calendar,
		Clock,
		FileText,
		CheckCircle2,
		X,
		AlertCircle,
		ArrowLeft,
		Printer,
		Download,
		User,
		AlertTriangle,
		Info,
		HelpCircle,
		Edit,
		RefreshCw,
		Save,
		Shield,
		History,
		Clipboard,
		Undo2,
		Trash2,
		Eye
	} from 'lucide-svelte';
	import { format, parseISO, addDays, isValid, eachDayOfInterval, endOfWeek } from 'date-fns';
	import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
	import { cn } from '$lib/utils';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { USER_ROLES } from '$lib/config/constants';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	export let data: PageData;
	$: user = data.user;

	// State variables
	let approvalDialogOpen = false;
	let rejectionDialogOpen = false;
	let rejectionNote = '';
	let activeTab = 'hours';
	let overrideDialogOpen = false;
	let submitDialogOpen = false;

	// Editing state
	let isEditing = false;
	let initialLoadDone = false;
	let dataLoaded = false;

	// Adjusted hourly rate editing (admin only)
	let editingRate = false;
	let rateInputValue: number | null = null;
	let rateSaving = false;

	// Derive workday and effective rate reactively
	$: primaryWorkday = data.workdays?.[0] ?? null;
	$: adjustedHourlyRate = data?.timesheet?.adjustedHourlyRate ?? null;
	$: effectiveHourlyRate = adjustedHourlyRate ?? data?.timesheet?.hourlyRate ?? 0;
	$: invoice = data.invoice;
	$: wagesStatus = data.timesheet?.wagesStatus ?? null;

	function startEditingRate() {
		rateInputValue = adjustedHourlyRate;
		editingRate = true;
	}

	function cancelEditingRate() {
		editingRate = false;
		rateInputValue = null;
	}

	$: {
		if (data?.requisition?.referenceTimezone && data.workdays) {
			dataLoaded = true;
		}
	}

	$: reqTimezone =
		data?.requisition?.location?.timezone ||
		data?.requisition?.referenceTimezone ||
		'America/New_York';
	$: reqTimezoneName = reqTimezone.split('/')[1]?.replace(/_/g, ' ') || reqTimezone;

	let timeEntries: Record<
		string,
		{
			startTime: string;
			endTime: string;
			hours: number;
			lunchStartTime?: string;
			lunchEndTime?: string;
		}
	> = {};

	// const weekBeginDate = parseISO(data?.timesheet?.weekBeginDate || new Date().toISOString());
	// const weekEndDate = endOfWeek(weekBeginDate);

	const start = new Date(data?.timesheet?.weekBeginDate || new Date().toISOString());
	const end = new Date(start);
	end.setUTCDate(start.getUTCDate() + 6);
	const fmt = (d: Date) =>
		d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

	const formattedWeekRange = `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;

	$: workdayDates = data.workdays ? data.workdays.map((wd: any) => wd.recurrenceDay?.date) : [];

	$: scheduledWorkDays = workdayDates
		.map((dateStr: string) => {
			const date = parseISO(dateStr);
			return {
				date,
				dateKey: format(date, 'yyyy-MM-dd'),
				dayString: format(date, 'EEE, MMM d')
			};
		})
		.sort((a, b) => a.date.getTime() - b.date.getTime());

	$: {
		if (scheduledWorkDays.length > 0 && !initialLoadDone) {
			scheduledWorkDays.forEach(({ dateKey }) => {
				if (!timeEntries[dateKey]) {
					timeEntries[dateKey] = {
						startTime: '',
						endTime: '',
						lunchStartTime: '',
						lunchEndTime: '',
						hours: 0
					};
				}
			});
		}
	}

	function hasLatestShiftEnded(): boolean {
		if (!dataLoaded) return false;
		if (!data.workdays || data.workdays.length === 0) return true;
		if (!reqTimezone) return true;

		const sortedWorkdays = [...data.workdays].sort((a, b) => {
			const dateA = new Date(a.recurrenceDay.date);
			const dateB = new Date(b.recurrenceDay.date);
			return dateA.getTime() - dateB.getTime();
		});

		const latestWorkday = sortedWorkdays[sortedWorkdays.length - 1];
		if (!latestWorkday?.recurrenceDay?.dayEnd) return true;

		try {
			const now = new Date();
			const nowInReqZone = toZonedTime(now, reqTimezone);
			const shiftEndTime = new Date(latestWorkday.recurrenceDay.dayEnd);
			const shiftEndInReqZone = toZonedTime(shiftEndTime, reqTimezone);
			return nowInReqZone >= shiftEndInReqZone;
		} catch (error) {
			console.error('Error checking shift end time:', error);
			return true;
		}
	}

	function loadTimeEntries() {
		scheduledWorkDays.forEach(({ dateKey }) => {
			timeEntries[dateKey] = {
				startTime: '',
				endTime: '',
				lunchStartTime: '',
				lunchEndTime: '',
				hours: 0
			};
		});

		if (
			data?.timesheet?.hoursRaw &&
			Array.isArray(data.timesheet.hoursRaw) &&
			data.timesheet.hoursRaw.length > 0
		) {
			data.timesheet.hoursRaw.forEach((entry: any) => {
				const dateKey = entry.date;

				const startTime = entry.startTime
					? new Date(entry.startTime).toLocaleTimeString('en-US', {
							hour12: false,
							hour: '2-digit',
							minute: '2-digit'
						})
					: '';

				const endTime = entry.endTime
					? new Date(entry.endTime).toLocaleTimeString('en-US', {
							hour12: false,
							hour: '2-digit',
							minute: '2-digit'
						})
					: '';

				const lunchStartTime = entry.lunchStartTime
					? new Date(entry.lunchStartTime).toLocaleTimeString('en-US', {
							hour12: false,
							hour: '2-digit',
							minute: '2-digit'
						})
					: '';

				const lunchEndTime = entry.lunchEndTime
					? new Date(entry.lunchEndTime).toLocaleTimeString('en-US', {
							hour12: false,
							hour: '2-digit',
							minute: '2-digit'
						})
					: '';

				if (timeEntries[dateKey]) {
					timeEntries[dateKey] = {
						startTime,
						endTime,
						lunchStartTime,
						lunchEndTime,
						hours: entry.hours || 0
					};
				}
			});
		}

		timeEntries = { ...timeEntries };
	}

	function calculateLunchHours(lunchStart: string, lunchEnd: string): number {
		if (!lunchStart || !lunchEnd) return 0;
		const [startHour, startMin] = lunchStart.split(':').map(Number);
		const [endHour, endMin] = lunchEnd.split(':').map(Number);
		const hours = endHour - startHour + (endMin - startMin) / 60;
		return Math.max(0, Math.round(hours * 100) / 100);
	}

	function calculateHours(
		startTime: string,
		endTime: string,
		lunchStart: string = '',
		lunchEnd: string = ''
	): number {
		if (!startTime || !endTime) return 0;

		const [startHour, startMin] = startTime.split(':').map(Number);
		const [endHour, endMin] = endTime.split(':').map(Number);
		const totalTime = endHour - startHour + (endMin - startMin) / 60;

		const lunchHours = calculateLunchHours(lunchStart, lunchEnd);
		const hoursWorked = totalTime - lunchHours;

		return Math.round(hoursWorked * 100) / 100;
	}

	onMount(() => {
		loadTimeEntries();
		initialLoadDone = true;
	});

	$: totalHours = Object.values(timeEntries).reduce((sum, entry) => sum + (entry.hours || 0), 0);
	$: hasHoursEntered = Object.values(timeEntries).some((entry) => entry.hours > 0);
	$: latestShiftEnded = dataLoaded ? hasLatestShiftEnded() : false;

	$: canSubmit =
		user?.role === USER_ROLES.SUPERADMIN
			? hasHoursEntered && totalHours > 0
			: hasHoursEntered && totalHours > 0 && latestShiftEnded;

	$: isDraft = data?.timesheet?.status === 'DRAFT';
	$: isPending = data?.timesheet?.status === 'PENDING';
	$: isDiscrepancy = data?.timesheet?.status === 'DISCREPANCY';
	$: isApproved = data?.timesheet?.status === 'APPROVED';
	$: isVoid = data?.timesheet?.status === 'VOID';
	$: isRejected = data?.timesheet?.status === 'REJECTED';

	$: canEdit =
		user?.role === USER_ROLES.SUPERADMIN ? isEditing : isDraft || (isDiscrepancy && isEditing);

	$: showEditButton = user?.role === USER_ROLES.SUPERADMIN && !isEditing;

	function updateTimeEntry(
		dateKey: string,
		field: 'startTime' | 'endTime' | 'lunchStartTime' | 'lunchEndTime',
		value: string
	) {
		if (!timeEntries[dateKey]) {
			timeEntries[dateKey] = {
				startTime: '',
				endTime: '',
				lunchStartTime: '',
				lunchEndTime: '',
				hours: 0
			};
		}

		timeEntries[dateKey][field] = value;

		timeEntries[dateKey].hours = calculateHours(
			timeEntries[dateKey].startTime,
			timeEntries[dateKey].endTime,
			timeEntries[dateKey].lunchStartTime,
			timeEntries[dateKey].lunchEndTime
		);

		timeEntries = { ...timeEntries };
	}

	function enableEditing() {
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		loadTimeEntries();
	}

	function getTimesheetStatusBadge() {
		const badges = {
			DRAFT: { text: 'DRAFT', icon: Edit, class: 'bg-gray-300 hover:bg-gray-400' },
			PENDING: { text: 'PENDING', icon: AlertCircle, class: 'bg-yellow-300 hover:bg-yellow-400' },
			DISCREPANCY: {
				text: 'DISCREPANCY',
				icon: AlertTriangle,
				class: 'bg-orange-400 hover:bg-orange-500'
			},
			APPROVED: { text: 'APPROVED', icon: CheckCircle2, class: 'bg-green-400 hover:bg-green-600' },
			VOID: { text: 'VOID', icon: X, class: 'bg-gray-200 hover:bg-gray-300' },
			REJECTED: { text: 'REJECTED', icon: X, class: 'bg-red-500 hover:bg-red-600' }
		};
		return badges[data?.timesheet?.status] || badges.DRAFT;
	}

	function getCostEstimate() {
		const hours = parseFloat(data?.timesheet?.totalHoursWorked || '0');
		return (Number(effectiveHourlyRate) * hours).toFixed(2);
	}

	function formatTimeInReqZone(date: Date | string, formatStr: string = 'h:mm a'): string {
		if (!date) return 'N/A';
		try {
			return formatInTimeZone(new Date(date), reqTimezone, formatStr);
		} catch (error) {
			console.error('Error formatting time:', error);
			return 'N/A';
		}
	}

	function formatFullDate(dateString: string) {
		if (!dateString) return 'N/A';
		try {
			const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
			if (!isValid(date)) return 'Invalid Date';
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch (error) {
			console.error('Error formatting date:', error, dateString);
			return 'Date Error';
		}
	}

	function hasDiscrepancies() {
		return data?.timesheet?.status === 'DISCREPANCY';
	}

	const statusBadge = getTimesheetStatusBadge();
</script>

{#if user.role === USER_ROLES.SUPERADMIN}
	<section class="container mx-auto px-4 py-6 space-y-6">
		<!-- Admin Header -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<div class="flex items-center gap-3 flex-wrap">
					<h1 class="text-2xl font-bold">Timesheet Details</h1>
					<Badge
						class={cn(statusBadge.class, 'gap-1')}
						variant="default"
						value={statusBadge.text}
					/>
					{#if wagesStatus}
						<span
							class={cn(
								'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
								wagesStatus === 'WAGES_DUE'
									? 'bg-red-100 text-red-700'
									: 'bg-green-100 text-green-700'
							)}
						>
							{wagesStatus === 'WAGES_DUE' ? 'Wages Due' : 'Wages Paid'}
						</span>
					{/if}
				</div>
				<p class="text-gray-600 flex items-center mt-1">
					<Calendar class="h-4 w-4 mr-1" />
					Week of {formattedWeekRange}
				</p>
				<p class="text-sm text-blue-600 font-medium mt-1 flex items-center gap-1">
					<Clock class="h-3 w-3" />
					All times shown in {reqTimezoneName} time
				</p>
			</div>

			<div class="flex gap-2">
				<Button on:click={() => goto('/timesheets')} variant="outline" class="gap-1">
					<ArrowLeft class="h-4 w-4" />
					Back to List
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline" class="gap-1">
							Actions
							<ChevronDown class="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem>
							<a
								href={`/requisitions/${data.requisition.id}`}
								class="flex items-center gap-2 w-full"
							>
								<Eye class="h-4 w-4" />
								View Requisition
							</a>
						</DropdownMenuItem>
						{#if data.invoice}
							<DropdownMenuItem>
								<a href={`/invoices/${data.invoice.id}`} class="flex items-center gap-2 w-full">
									<FileText class="h-4 w-4" />
									View Invoice
								</a>
							</DropdownMenuItem>
						{/if}
						{#if isApproved && wagesStatus === 'WAGES_PAID'}
							<DropdownMenuSeparator />
							<DropdownMenuItem>
								<form method="POST" action="?/markWagesDue" use:enhance class="w-full">
									<button type="submit" class="flex items-center gap-2 w-full text-orange-600">
										<AlertCircle class="h-4 w-4" />
										Mark Wages Due
									</button>
								</form>
							</DropdownMenuItem>
						{/if}
						{#if isApproved && wagesStatus === 'WAGES_DUE'}
							<DropdownMenuSeparator />
							<DropdownMenuItem>
								<form method="POST" action="?/markWagesPaid" use:enhance class="w-full">
									<button type="submit" class="flex items-center gap-2 w-full text-green-700">
										<CheckCircle2 class="h-4 w-4" />
										Mark Wages Paid
									</button>
								</form>
							</DropdownMenuItem>
						{/if}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Main Content -->
			<div class="md:col-span-2 space-y-6">
				<!-- Timesheet Info Card -->
				<Card>
					<CardHeader>
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div>
								<CardTitle>{data?.requisition.discipline.name}</CardTitle>
								<CardDescription>
									<p>
										• Candidate: {data?.timesheet?.candidate?.firstName}
										{data?.timesheet?.candidate?.lastName}
										<span>#{data?.timesheet?.candidate?.puid}</span>
									</p>
									<p>• Client: {data?.timesheet?.clientCompanyName}</p>
									<p>
										• Worker's Comp. Code: {#if data?.requisition.discipline.workersCompCode}
											{data.requisition.discipline.workersCompCode}
										{:else}
											N/A
										{/if}
									</p>
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent class="space-y-6">
						<!-- Timesheet Summary -->
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
							<div class="p-3 bg-gray-50 rounded-lg">
								<p class="text-sm text-gray-600">Total Hours</p>
								<p class="text-xl font-bold">
									{canEdit ? totalHours.toFixed(2) : data?.timesheet?.totalHoursWorked}
								</p>
							</div>

							<!-- Hourly Rate tile — editable for admin -->
							<div
								class="p-3 bg-gray-50 rounded-lg flex flex-col items-center justify-center gap-1"
							>
								<p class="text-sm text-gray-600">Hourly Rate</p>
								{#if editingRate}
									<form
										method="POST"
										action="?/setAdjustedHourlyRate"
										use:enhance={() => {
											rateSaving = true;
											return async ({ result, update }) => {
												rateSaving = false;
												if (result.type === 'success') {
													editingRate = false;
												}
												await update();
											};
										}}
										class="flex items-center gap-1"
									>
										<span class="text-sm">$</span>
										<input
											type="number"
											name="adjustedHourlyRate"
											min="0"
											class="w-16 h-7 text-sm border rounded px-1 text-center"
											bind:value={rateInputValue}
											placeholder={String(data?.timesheet?.hourlyRate ?? '')}
										/>
										<Button
											type="submit"
											size="sm"
											class="h-7 px-2 bg-[#2a93d1] hover:bg-blue-500"
											disabled={rateSaving}
										>
											{rateSaving ? '...' : 'Save'}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="h-7 px-2"
											on:click={cancelEditingRate}
										>
											<X class="h-3 w-3" />
										</Button>
									</form>
								{:else}
									<div class="flex items-center gap-1">
										{#if adjustedHourlyRate != null}
											<p class="text-xl font-bold text-[#2a93d1]">${adjustedHourlyRate}</p>
											<p class="text-sm text-muted-foreground line-through">
												${data?.timesheet?.hourlyRate}
											</p>
										{:else}
											<p class="text-xl font-bold">${data?.timesheet?.hourlyRate}</p>
										{/if}
										{#if !isApproved}
											<Button
												variant="ghost"
												size="icon"
												class="h-5 w-5 ml-1"
												on:click={startEditingRate}
											>
												<Edit class="h-3 w-3" />
											</Button>
										{/if}
									</div>
								{/if}
							</div>

							<div class="p-3 bg-gray-50 rounded-lg">
								<p class="text-sm text-gray-600">Est. Cost</p>
								<p class="text-xl font-bold">
									${(
										Number(effectiveHourlyRate) *
										parseFloat(
											canEdit ? totalHours.toFixed(2) : data?.timesheet?.totalHoursWorked || '0'
										)
									).toFixed(2)}
								</p>
							</div>
						</div>

						{#if isDiscrepancy}
							<Separator />
							<Alert variant="destructive">
								<AlertTriangle class="h-4 w-4" />
								<AlertTitle>Timesheet Discrepancy</AlertTitle>
								<AlertDescription class="mt-2">
									<p class="text-sm font-medium mb-1">Reason:</p>
									<p class="text-sm whitespace-pre-wrap">
										{data?.timesheet?.discrepancyNote || 'No notes provided'}
									</p>
								</AlertDescription>
							</Alert>
						{/if}
					</CardContent>
				</Card>

				<!-- Tabs -->
				<Tabs bind:value={activeTab} class="w-full">
					<TabsList class="grid grid-cols-3 w-full">
						<TabsTrigger value="hours">Hours Detail</TabsTrigger>
						<TabsTrigger value="discrepancies">Discrepancies</TabsTrigger>
						<TabsTrigger value="history" class="relative">
							Audit History
							{#if data.auditHistory && data.auditHistory.length}
								<span
									class="absolute top-1 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800"
								>
									{data.auditHistory.length}
								</span>
							{/if}
						</TabsTrigger>
					</TabsList>

					<!-- Hours Detail Tab -->
					<TabsContent value="hours" class="space-y-4 pt-4">
						<Card>
							<CardHeader>
								<div class="flex items-center justify-between">
									<div>
										<CardTitle>Daily Hours</CardTitle>
										<CardDescription>
											{canEdit ? 'Enter hours for scheduled workdays' : 'Hours worked'}
										</CardDescription>
									</div>
									<div class="flex gap-2">
										{#if canEdit}
											<Badge variant="secondary" class="gap-1" value="Editable"></Badge>
										{/if}
										{#if showEditButton}
											<Button size="sm" variant="outline" on:click={enableEditing}>
												<Edit class="h-4 w-4 mr-2" />
												Edit Hours
											</Button>
										{/if}
									</div>
								</div>
							</CardHeader>

							<CardContent>
								{#if canEdit}
									{#if scheduledWorkDays.length > 0}
										<div class="space-y-4">
											{#each scheduledWorkDays as { dateKey, dayString }}
												{#if timeEntries[dateKey]}
													{@const recurrenceDay = data.recurrenceDays.find(
														(day) => day.date === dateKey
													)}
													<div class="p-3 bg-gray-50 rounded-lg space-y-3">
														<div class="flex items-center justify-between">
															<p class="text-sm font-medium">{dayString}</p>
															<p class="text-sm font-semibold text-blue-700">
																{timeEntries[dateKey]?.hours?.toFixed(2) || '0.00'} hrs
															</p>
														</div>

														<div class="grid grid-cols-2 gap-2">
															<div>
																<Label for="{dateKey}-start" class="text-xs text-gray-600">
																	Start Time ({reqTimezoneName})
																</Label>
																<Input
																	id="{dateKey}-start"
																	type="time"
																	class="text-sm mt-1"
																	value={timeEntries[dateKey].startTime}
																	on:input={(e) =>
																		updateTimeEntry(dateKey, 'startTime', e.currentTarget.value)}
																/>
															</div>
															<div>
																<Label for="{dateKey}-end" class="text-xs text-gray-600">
																	End Time ({reqTimezoneName})
																</Label>
																<Input
																	id="{dateKey}-end"
																	type="time"
																	class="text-sm mt-1"
																	value={timeEntries[dateKey].endTime}
																	on:input={(e) =>
																		updateTimeEntry(dateKey, 'endTime', e.currentTarget.value)}
																/>
															</div>
														</div>

														<div class="grid grid-cols-2 gap-2">
															<div>
																<Label for="{dateKey}-lunch-start" class="text-xs text-gray-600">
																	Lunch Start <span class="text-gray-400">(Optional)</span>
																</Label>
																<Input
																	id="{dateKey}-lunch-start"
																	type="time"
																	class="text-sm mt-1"
																	placeholder="Optional"
																	value={timeEntries[dateKey].lunchStartTime}
																	on:input={(e) =>
																		updateTimeEntry(
																			dateKey,
																			'lunchStartTime',
																			e.currentTarget.value
																		)}
																/>
															</div>
															<div>
																<Label for="{dateKey}-lunch-end" class="text-xs text-gray-600">
																	Lunch End <span class="text-gray-400">(Optional)</span>
																</Label>
																<Input
																	id="{dateKey}-lunch-end"
																	type="time"
																	class="text-sm mt-1"
																	placeholder="Optional"
																	value={timeEntries[dateKey].lunchEndTime}
																	on:input={(e) =>
																		updateTimeEntry(dateKey, 'lunchEndTime', e.currentTarget.value)}
																/>
															</div>
														</div>

														{#if timeEntries[dateKey].lunchStartTime && timeEntries[dateKey].lunchEndTime}
															{@const lunchDuration = calculateLunchHours(
																timeEntries[dateKey].lunchStartTime,
																timeEntries[dateKey].lunchEndTime
															)}
															<div class="text-xs text-gray-600 flex items-center gap-1">
																<span>🍽️</span>
																<span>Lunch break: {lunchDuration.toFixed(2)} hrs (unpaid)</span>
															</div>
														{/if}

														{#if recurrenceDay}
															<div class="pt-2 border-t">
																<p class="text-xs text-muted-foreground">
																	Scheduled: {formatTimeInReqZone(recurrenceDay.dayStart)} - {formatTimeInReqZone(
																		recurrenceDay.dayEnd
																	)}
																	{#if recurrenceDay.lunchStart && recurrenceDay.lunchEnd}
																		<span class="ml-2">
																			(Lunch: {formatTimeInReqZone(recurrenceDay.lunchStart)} - {formatTimeInReqZone(
																				recurrenceDay.lunchEnd
																			)})
																		</span>
																	{/if}
																</p>
															</div>
														{/if}
													</div>
												{/if}
											{/each}

											{#if isEditing}
												<div class="flex justify-end gap-2 pt-2">
													<Button variant="outline" size="sm" on:click={cancelEditing}>
														Cancel
													</Button>
													<Button
														size="sm"
														disabled={!canSubmit}
														on:click={() => {
															const action = isDraft
																? '?/adminSubmitTimesheet'
																: isDiscrepancy
																	? '?/adminResubmitTimesheet'
																	: '?/adminSubmitTimesheet';

															const form = document.createElement('form');
															form.method = 'POST';
															form.action = action;

															const entriesInput = document.createElement('input');
															entriesInput.type = 'hidden';
															entriesInput.name = 'entries';
															entriesInput.value = JSON.stringify(timeEntries);

															const hoursInput = document.createElement('input');
															hoursInput.type = 'hidden';
															hoursInput.name = 'totalHours';
															hoursInput.value = totalHours.toString();

															form.appendChild(entriesInput);
															form.appendChild(hoursInput);
															document.body.appendChild(form);
															form.submit();
														}}
													>
														<Save class="h-4 w-4 mr-2" />
														Save Changes
													</Button>
												</div>
											{/if}
										</div>

										<div class="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 flex gap-2">
											<Info class="h-4 w-4 flex-shrink-0 mt-0.5" />
											<p>
												<strong>Note:</strong> Enter all times in {reqTimezoneName} time zone. Lunch
												breaks are optional and will be deducted from total hours.
											</p>
										</div>
									{:else}
										<div class="py-12 text-center text-muted-foreground">
											<AlertCircle class="h-12 w-12 mx-auto mb-3" />
											<p>No scheduled workdays found for this week</p>
										</div>
									{/if}
								{:else}
									<!-- Read-only view — show hoursRaw if available, otherwise show scheduled workdays -->
									{@const rowsToShow =
										data?.timesheet?.hoursRaw && data.timesheet.hoursRaw.length > 0
											? data.timesheet.hoursRaw.map((entry) => ({
													dateKey: entry.date,
													dayString: formatFullDate(entry.date),
													startTime: entry.startTime,
													endTime: entry.endTime,
													lunchStartTime: entry.lunchStartTime,
													lunchEndTime: entry.lunchEndTime,
													hours: entry.hours,
													hasEntry: true
												}))
											: scheduledWorkDays.map(({ dateKey, dayString }) => ({
													dateKey,
													dayString,
													startTime: null,
													endTime: null,
													lunchStartTime: null,
													lunchEndTime: null,
													hours: null,
													hasEntry: false
												}))}
									{#if rowsToShow.length > 0}
										<div class="divide-y">
											{#each rowsToShow as row}
												{@const recurrenceDay = data?.recurrenceDays.find(
													(d) => d.date === row.dateKey
												)}
												<div class="py-3">
													<div class="flex items-center justify-between mb-1">
														<p class="font-medium">{row.dayString}</p>
														{#if row.hasEntry}
															<p class="text-lg font-semibold">{row.hours} hrs</p>
														{:else}
															<p class="text-sm text-gray-400 italic">No hours entered</p>
														{/if}
													</div>
													{#if row.hasEntry}
														<div class="text-sm text-muted-foreground space-y-1">
															<p>
																Work: {formatTimeInReqZone(row.startTime)} - {formatTimeInReqZone(
																	row.endTime
																)}
																<span class="text-xs text-blue-600">({reqTimezoneName})</span>
															</p>
															{#if row.lunchStartTime && row.lunchEndTime}
																<p class="flex items-center gap-1">
																	<span class="text-xs">🍽️</span>
																	Lunch: {formatTimeInReqZone(row.lunchStartTime)} - {formatTimeInReqZone(
																		row.lunchEndTime
																	)}
																</p>
															{/if}
														</div>
													{/if}
													{#if recurrenceDay}
														<div class="pt-2 border-t mt-2">
															<p class="text-xs text-muted-foreground">
																Scheduled: {formatTimeInReqZone(recurrenceDay.dayStart)} - {formatTimeInReqZone(
																	recurrenceDay.dayEnd
																)}
																{#if recurrenceDay.lunchStart && recurrenceDay.lunchEnd}
																	<span class="ml-2">
																		(Lunch: {formatTimeInReqZone(recurrenceDay.lunchStart)} - {formatTimeInReqZone(
																			recurrenceDay.lunchEnd
																		)})
																	</span>
																{/if}
															</p>
														</div>
													{/if}
												</div>
											{/each}
										</div>
									{:else}
										<div class="py-12 text-center text-muted-foreground">
											<Clipboard class="h-12 w-12 mx-auto mb-3" />
											<p>No scheduled workdays found for this timesheet</p>
										</div>
									{/if}
								{/if}
							</CardContent>
						</Card>
					</TabsContent>

					<!-- Discrepancies Tab -->
					<TabsContent value="discrepancies" class="space-y-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>Timesheet Discrepancies</CardTitle>
								<CardDescription>Resolve issues before timesheet approval</CardDescription>
							</CardHeader>
							<CardContent>
								{#if hasDiscrepancies()}
									<div class="p-4 border rounded-lg flex gap-3">
										<div class="mt-0.5">
											<AlertCircle class="h-5 w-5 text-amber-600" />
										</div>
										<div class="flex-1">
											<p class="mt-2">{data?.timesheet?.discrepancyNote}</p>
										</div>
									</div>
								{:else}
									<div class="p-8 text-center">
										<CheckCircle2 class="h-12 w-12 text-green-500 mx-auto mb-3" />
										<h3 class="text-lg font-medium">No Discrepancies Found</h3>
										<p class="text-gray-600 mt-1">
											This timesheet has no issues and is ready for review.
										</p>
									</div>
								{/if}
							</CardContent>
						</Card>
					</TabsContent>

					<!-- Audit History Tab -->
					<TabsContent value="history" class="space-y-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>Audit History</CardTitle>
								<CardDescription>Record of all changes made to this timesheet</CardDescription>
							</CardHeader>
							<CardContent>
								{#if data.auditHistory && data.auditHistory.length > 0}
									<div class="space-y-4">
										{#each data.auditHistory as record}
											<div class="p-4 border rounded-lg flex gap-3">
												<div class="mt-0.5">
													<History class="h-5 w-5 text-blue-600" />
												</div>
												<div class="flex-1">
													<div class="flex items-start justify-between">
														<div>
															<p class="font-medium">
																{record.user.firstName}
																{record.user.lastName}
																<span class="font-regular text-sm">
																	{#if record.action === 'CREATE'}created{/if}
																	{#if record.action === 'UPDATE'}updated{/if}
																	{#if record.action === 'DELETE'}deleted{/if}
																	timesheet
																</span>
															</p>
															<p class="text-xs text-gray-500">
																{format(record.createdAt, 'PPp')}
															</p>
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								{:else}
									<div class="p-8 text-center">
										<History class="h-12 w-12 text-gray-400 mx-auto mb-3" />
										<h3 class="text-lg font-medium">No Audit History</h3>
										<p class="text-gray-600 mt-1">
											No corrections or overrides have been made to this timesheet.
										</p>
									</div>
								{/if}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>

			<!-- Sidebar -->
			<div class="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Admin Actions</CardTitle>
						<CardDescription>Manage timesheet status</CardDescription>
					</CardHeader>
					<CardContent class="space-y-4">
						<p class="text-sm text-muted-foreground">
							{#if isDraft}
								This timesheet is in draft status. You can edit and submit it on behalf of the
								professional.
							{:else if isPending}
								This timesheet is pending approval. You can approve, reject, or mark a discrepancy.
							{:else if isDiscrepancy}
								This timesheet has discrepancies. Edit the hours and resubmit.
							{:else if isVoid}
								This timesheet has been voided. You can edit and resubmit if needed.
							{:else if isRejected}
								This timesheet has been rejected. You can edit and resubmit.
							{:else if isApproved}
								This timesheet has been approved and processed. You can still edit if needed.
							{/if}
						</p>

						<div class="space-y-2">
							{#if !isEditing}
								<Button on:click={enableEditing} variant="outline" class="w-full gap-2">
									<Edit class="h-4 w-4" />
									<span>Edit Hours</span>
								</Button>
							{/if}

							{#if isPending && !isEditing}
								<Button
									class="w-full bg-green-700 hover:bg-green-800 gap-2"
									disabled={hasDiscrepancies()}
									on:click={() => (approvalDialogOpen = true)}
								>
									<CheckCircle2 class="h-4 w-4" />
									<span>Approve Timesheet</span>
								</Button>

								{#if hasDiscrepancies()}
									<Button
										variant="outline"
										class="w-full border-amber-200 text-amber-700 hover:bg-amber-50 gap-2"
										on:click={() => (overrideDialogOpen = true)}
									>
										<Shield class="h-4 w-4" />
										<span>Override Discrepancies</span>
									</Button>
								{/if}

								<Button
									variant="outline"
									class="w-full border-red-200 text-red-700 hover:bg-red-50 gap-2"
									on:click={() => (rejectionDialogOpen = true)}
								>
									<X class="h-4 w-4" />
									<span>Reject Timesheet</span>
								</Button>
							{/if}

							{#if canEdit}
								<Alert>
									<Edit class="h-4 w-4" />
									<AlertDescription>
										You are currently editing hours. Save or cancel your changes.
									</AlertDescription>
								</Alert>
							{:else if hasDiscrepancies() && !isApproved && !isEditing}
								<Alert variant="destructive" class="mt-3">
									<AlertCircle class="h-4 w-4" />
									<AlertDescription>
										This timesheet has unresolved discrepancies. Edit the hours to fix them or use
										the override function.
									</AlertDescription>
								</Alert>
							{/if}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>

		<!-- Dialogs -->
		<Dialog bind:open={approvalDialogOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Approve Timesheet</DialogTitle>
					<DialogDescription>
						Approving this timesheet will confirm that the hours and work details are accurate.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter class="mt-4">
					<form method="POST" action="?/approveTimesheet" use:enhance>
						<Button type="button" variant="outline" on:click={() => (approvalDialogOpen = false)}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="default"
							class="bg-green-500 hover:bg-green-600 text-white"
							on:click={() => (approvalDialogOpen = false)}
						>
							Approve Timesheet
						</Button>
					</form>
				</DialogFooter>
			</DialogContent>
		</Dialog>

		<Dialog bind:open={rejectionDialogOpen}>
			<DialogContent>
				<form
					method="POST"
					action="?/rejectTimesheet"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								rejectionDialogOpen = false;
								rejectionNote = '';
								window.location.reload();
							}
						};
					}}
				>
					<DialogHeader>
						<DialogTitle>Reject Timesheet</DialogTitle>
						<DialogDescription>
							Please provide a reason for rejecting this timesheet. This will be sent to the
							candidate so they can correct the issues.
						</DialogDescription>
					</DialogHeader>

					<div class="py-4">
						<Label for="discrepancyNote" class="text-sm font-medium">
							Reason for Rejection <span class="text-red-500">*</span>
						</Label>
						<Textarea
							id="discrepancyNote"
							name="discrepancyNote"
							bind:value={rejectionNote}
							placeholder="Explain what needs to be corrected..."
							class="mt-2 min-h-[100px]"
							required
						/>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							on:click={() => {
								rejectionDialogOpen = false;
								rejectionNote = '';
							}}
						>
							Cancel
						</Button>
						<Button type="submit" variant="destructive" disabled={!rejectionNote.trim()}>
							Reject Timesheet
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>

		<Dialog bind:open={overrideDialogOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Override Discrepancies</DialogTitle>
					<DialogDescription>
						You're about to approve this timesheet despite having unresolved discrepancies.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter class="mt-4">
					<form method="POST" use:enhance action="?/adminOverrideTimesheet">
						<Button type="button" variant="outline">Cancel</Button>
						<Button
							on:click={() => (overrideDialogOpen = false)}
							type="submit"
							variant="default"
							class="bg-amber-600 hover:bg-amber-700"
						>
							Override & Approve
						</Button>
					</form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</section>
{:else}
	<!-- CLIENT VIEW -->
	<section class="container mx-auto px-4 py-6 space-y-6">
		<div class="flex flex-wrap justify-between">
			<div>
				<div class="flex flex-wrap items-center gap-3">
					<h1 class="text-2xl font-bold">Timesheet Review</h1>
					<Badge
						class={cn(
							data?.timesheet?.status === 'PENDING' && 'bg-yellow-300 hover:bg-yellow-400',
							data?.timesheet?.status === 'DISCREPANCY' && 'bg-orange-400 hover:bg-bg-orange-500',
							data?.timesheet?.status === 'APPROVED' && 'bg-green-400 hover:bg-green-600',
							data?.timesheet?.status === 'VOID' && 'bg-gray-200 hover:bg-gray-300',
							data?.timesheet?.status === 'REJECTED' && 'bg-red-500 hover:bg-red-500'
						)}
						value={data?.timesheet?.status}
					/>
				</div>
				<p class="text-gray-600 flex items-center mt-1">
					<Calendar class="h-4 w-4 mr-1" />
					Week of {formattedWeekRange}
				</p>
			</div>
			<div class="flex gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline" class="gap-1">
							Actions
							<ChevronDown class="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem>
							<a
								href={`/requisitions/${data.requisition.id}`}
								class="flex items-center gap-2 w-full"
							>
								<Eye class="h-4 w-4" />
								View Requisition
							</a>
						</DropdownMenuItem>
						{#if data.invoice}
							<DropdownMenuItem>
								<a href={`/invoices/${data.invoice.id}`} class="flex items-center gap-2 w-full">
									<FileText class="h-4 w-4" />
									View Invoice
								</a>
							</DropdownMenuItem>
						{/if}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>

		{#if hasDiscrepancies()}
			<Alert variant="destructive">
				<AlertTriangle class="h-4 w-4" />
				<AlertTitle>Attention Required</AlertTitle>
				<AlertDescription>
					This timesheet has an issue that needs your review before approval. Check the
					Discrepancies tab for details.
				</AlertDescription>
			</Alert>
		{/if}

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div class="md:col-span-2 space-y-6">
				<Card>
					<CardHeader>
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<CardTitle
									>{data?.requisition.discipline.name}
									<span class="text-muted-foreground text-xs">Req#: {data?.requisition.id}</span
									></CardTitle
								>
								<CardDescription
									>{data?.timesheet?.candidate?.firstName}
									{data?.timesheet?.candidate?.lastName}</CardDescription
								>
							</div>
						</div>
					</CardHeader>
					<CardContent class="space-y-6">
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
							<div class="p-3 bg-gray-50 rounded-lg">
								<p class="text-sm text-gray-600">Total Hours</p>
								<p class="text-xl font-bold">{data?.timesheet?.totalHoursWorked}</p>
							</div>
							<div class="p-3 bg-gray-50 rounded-lg">
								<p class="text-sm text-gray-600">Hourly Rate</p>
								<p class="text-xl font-bold">${effectiveHourlyRate}</p>
							</div>
							<div class="p-3 bg-gray-50 rounded-lg">
								<p class="text-sm text-gray-600">Est. Cost</p>
								<p class="text-xl font-bold">${getCostEstimate()}</p>
							</div>
						</div>

						<Separator />

						<div class="flex items-start gap-4">
							<div class="bg-blue-100 rounded-full p-2.5">
								<User class="h-5 w-5 text-blue-700" />
							</div>
							<div>
								<h3 class="font-medium">Candidate Information</h3>
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
									<div>
										<p class="text-xs text-gray-600">Name</p>
										<p class="text-sm whitespace-pre-line">
											{data?.timesheet?.candidate?.firstName}
											{data?.timesheet?.candidate?.lastName || 'No Name Provided'}
										</p>
									</div>
									<div>
										<p class="text-xs text-gray-600">Email</p>
										<p class="text-sm whitespace-pre-line truncate">
											{data?.timesheet?.candidate?.email || 'No email provided'}
										</p>
									</div>
									<div>
										<p class="text-xs text-gray-600">Position</p>
										<p class="text-sm whitespace-pre-line">{data?.requisition.title}</p>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				<Tabs bind:value={activeTab} class="w-full">
					<TabsList class="grid grid-cols-2 w-full">
						<TabsTrigger value="hours">Hours Detail</TabsTrigger>
						<TabsTrigger value="discrepancies" class="relative">Discrepancies</TabsTrigger>
					</TabsList>

					<TabsContent value="hours" class="space-y-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>Hours Detail</CardTitle>
								<CardDescription>Breakdown of hours submitted by the candidate</CardDescription>
							</CardHeader>

							<CardContent>
								<div class="divide-y">
									<div class="py-2 grid grid-cols-12 text-sm font-medium text-gray-600">
										<div class="col-span-4">Day</div>
										<div class="col-span-3">Time</div>
										<div class="col-span-3">Scheduled Time</div>
										<div class="col-span-2 text-right">Hours</div>
									</div>
									{#each data?.timesheet?.hoursRaw || [] as entry}
										{@const recurrenceDay = data?.recurrenceDays.find(
											(day) => day.date === entry.date
										)}
										<div class="py-3 grid grid-cols-12 items-center">
											<div class="col-span-4">
												<p class="font-medium">
													{entry.date}
												</p>
											</div>
											<div class="col-span-3">
												<p class="text-sm text-gray-600">
													{format(entry.startTime, 'hh:mm a')} -{' '}
													{format(entry.endTime, 'hh:mm a')}
												</p>
											</div>
											<div class="col-span-3">
												<p class="text-sm text-gray-600">
													{format(recurrenceDay?.dayStart, 'hh:mm a')} - {format(
														recurrenceDay.dayEnd,
														'hh:mm a'
													)}
												</p>
											</div>
											<div class="col-span-2 text-right">
												<p class="font-semibold">{entry.hours} hrs</p>
											</div>
										</div>
									{/each}
									<div class="py-3 grid grid-cols-12 items-center bg-gray-50">
										<div class="col-span-9 font-bold">Total</div>
										<div class="col-span-3 text-right font-bold">
											{data?.timesheet?.totalHoursWorked} hrs
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="discrepancies" class="space-y-4 pt-4">
						<Card>
							<CardHeader>
								<CardTitle>Timesheet Discrepancies</CardTitle>
								<CardDescription>Issues that need to be resolved before approval</CardDescription>
							</CardHeader>

							<CardContent>
								{#if hasDiscrepancies()}
									<div class="p-4 border rounded-lg flex gap-3">
										<div class="mt-0.5">
											<AlertCircle class="h-5 w-5 text-amber-600" />
										</div>
										<div class="flex-1">
											<p class="mt-2">{data?.timesheet?.discrepancyNote}</p>
										</div>
									</div>
								{:else}
									<div class="p-8 text-center">
										<CheckCircle2 class="h-12 w-12 text-green-500 mx-auto mb-3" />
										<h3 class="text-lg font-medium">No Discrepancies Found</h3>
										<p class="text-gray-600 mt-1">
											This timesheet has no issues and is ready for review.
										</p>
									</div>
								{/if}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>

			<div class="space-y-6">
				{#if data?.timesheet?.status !== 'APPROVED'}
					<Card>
						<CardHeader>
							<CardTitle>Timesheet Approval</CardTitle>
							<CardDescription>Review and approve this timesheet</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<p class="text-sm text-gray-600">
								By approving this timesheet, you confirm that the hours and work details are
								accurate.
							</p>

							<div class="space-y-2">
								<Button
									class="w-full bg-green-700 hover:bg-green-800 gap-2"
									on:click={() => (approvalDialogOpen = true)}
									disabled={hasDiscrepancies()}
								>
									<CheckCircle2 class="h-4 w-4" />
									<span>Approve Timesheet</span>
								</Button>

								<Button
									variant="outline"
									class="w-full border-red-200 text-red-700 hover:bg-red-50 gap-2"
									on:click={() => (rejectionDialogOpen = true)}
									disabled={data.timesheet?.status === 'APPROVED'}
								>
									<X class="h-4 w-4" />
									<span>Reject Timesheet</span>
								</Button>
							</div>

							{#if hasDiscrepancies()}
								<Alert variant="default" class="mt-3">
									<AlertCircle class="h-4 w-4" />
									<AlertDescription>
										{#if data.timesheet?.status !== 'APPROVED'}
											{#if hasDiscrepancies()}
												This timesheet has unresolved discrepancies.
											{:else}
												This timesheet is currently under review
											{/if}
										{:else}
											This timesheet has been approved.
										{/if}
									</AlertDescription>
								</Alert>
							{/if}
						</CardContent>
					</Card>
				{:else}
					<Card>
						<CardHeader>
							<CardTitle>Approval Status</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="p-4 bg-green-50 rounded-lg flex items-start gap-3">
								<CheckCircle2 class="h-5 w-5 text-green-600 mt-0.5" />
								<div>
									<p class="font-medium text-green-800">Timesheet Approved</p>
									<p class="text-sm text-green-700">
										This timesheet was approved on {format(
											parseISO(data?.timesheet?.updatedAt.toISOString()),
											'MMM d, yyyy'
										)}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				{/if}
			</div>
		</div>
	</section>
{/if}
