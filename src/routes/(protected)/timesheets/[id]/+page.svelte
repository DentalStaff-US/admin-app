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
	import { StatusBadge } from '$lib/components/ui/status-badge';
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
		Ban,
		Eye,
		Plus,
		Receipt,
		ThumbsUp,
		ThumbsDown
	} from 'lucide-svelte';
	import { format, parseISO, addDays, isValid, eachDayOfInterval, endOfWeek } from 'date-fns';
	import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
	import { cn } from '$lib/utils';
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { superForm } from 'sveltekit-superforms/client';
	import { Loader2 } from 'lucide-svelte';
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
	let voidDialogOpen = false;
	let deleteDialogOpen = false;
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
	$: adminFeeSettings = data?.adminFeeSettings ?? { amount: 0, type: 'PERCENTAGE' as const };
	$: expenses = (data?.expenses ?? []) as Array<{
		id: string;
		description: string;
		amountCents: number;
		status: 'PENDING' | 'APPROVED' | 'REJECTED';
		createdByUserId: string;
		approvedByUserId: string | null;
		rejectionReason: string | null;
		createdAt: Date | string;
	}>;
	$: pendingExpenses = expenses.filter((e) => e.status === 'PENDING');
	$: approvedExpenses = expenses.filter((e) => e.status === 'APPROVED');
	$: rejectedExpenses = expenses.filter((e) => e.status === 'REJECTED');
	$: approvedExpensesTotal = approvedExpenses.reduce((s, e) => s + e.amountCents / 100, 0);
	$: billableHoursValue = parseFloat(canEdit ? totalHours.toFixed(2) : data?.timesheet?.totalHoursWorked || '0');
	$: regularHours = Math.min(billableHoursValue, 40);
	$: overtimeHours = Math.max(0, billableHoursValue - 40);
	$: regularAmount = Number(effectiveHourlyRate) * regularHours;
	$: overtimeAmount = overtimeHours * Number(effectiveHourlyRate) * 1.5;
	$: billableSubtotal = regularAmount + overtimeAmount;
	$: adminFeeAmount =
		adminFeeSettings.amount > 0
			? adminFeeSettings.type === 'PERCENTAGE'
				? (regularAmount * adminFeeSettings.amount) / 100
				: adminFeeSettings.amount
			: 0;
	$: invoiceTotal = billableSubtotal + approvedExpensesTotal + adminFeeAmount;
	$: adminFeeLabel =
		adminFeeSettings.amount > 0
			? adminFeeSettings.type === 'PERCENTAGE'
				? `Admin Fee (${adminFeeSettings.amount}%)`
				: `Admin Fee ($${adminFeeSettings.amount} flat)`
			: 'Admin Fee';

	// Add-expense form — superForm so we get $submitting for free
	const addExpenseSF = superForm(data.addExpenseForm, {
		resetForm: true,
		taintedMessage: null
	});
	const {
		enhance: addExpenseEnhance,
		form: addExpenseFormData,
		submitting: addExpenseSubmitting
	} = addExpenseSF;

	let rejectExpenseId: string | null = null;
	let rejectExpenseReason = '';

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
					? formatInTimeZone(new Date(entry.startTime), reqTimezone, 'HH:mm')
					: '';

				const endTime = entry.endTime
					? formatInTimeZone(new Date(entry.endTime), reqTimezone, 'HH:mm')
					: '';

				const lunchStartTime = entry.lunchStartTime
					? formatInTimeZone(new Date(entry.lunchStartTime), reqTimezone, 'HH:mm')
					: '';

				const lunchEndTime = entry.lunchEndTime
					? formatInTimeZone(new Date(entry.lunchEndTime), reqTimezone, 'HH:mm')
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

	// Admins may only edit hours in editable states — a DRAFT, or a DISCREPANCY
	// sent back for correction. Never edit a PENDING/APPROVED/VOID/REJECTED sheet.
	$: showEditButton =
		user?.role === USER_ROLES.SUPERADMIN && !isEditing && (isDraft || isDiscrepancy);

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

	// Posts the currently-entered hours to one of the admin actions. Save draft
	// keeps the sheet DRAFT (no client notification); Submit on behalf moves it to
	// PENDING for review.
	function postTimeEntries(action: string) {
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

</script>

{#if user.role === USER_ROLES.SUPERADMIN}
	<section class="container mx-auto px-4 py-6 space-y-6">
		<!-- Admin Header -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<div class="flex items-center gap-3 flex-wrap">
					<h1 class="text-2xl font-bold">Timesheet Details</h1>
					<StatusBadge status={data?.timesheet?.status} />
					{#if wagesStatus}
						<StatusBadge status={wagesStatus} />
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
								<p class="text-sm text-gray-600">Billable (Hours × Rate)</p>
								<p class="text-xl font-bold">${billableSubtotal.toFixed(2)}</p>
							</div>
						</div>

						<div class="rounded-lg border bg-gray-50 p-4">
							<p class="mb-3 text-sm font-medium text-gray-700">Billing Summary</p>
							<div class="space-y-1.5 text-sm">
								{#if overtimeHours > 0}
									<div class="flex justify-between">
										<span class="text-gray-600">Regular hours (40 hrs)</span>
										<span class="font-medium">${regularAmount.toFixed(2)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Overtime ({overtimeHours.toFixed(2)} hrs × 1.5×)</span>
										<span class="font-medium">${overtimeAmount.toFixed(2)}</span>
									</div>
								{:else}
									<div class="flex justify-between">
										<span class="text-gray-600">Billable Hours Total</span>
										<span class="font-medium">${billableSubtotal.toFixed(2)}</span>
									</div>
								{/if}
								{#if approvedExpenses.length > 0}
									<div class="flex justify-between">
										<span class="text-gray-600"
											>Approved Expenses ({approvedExpenses.length})</span
										>
										<span class="font-medium">${approvedExpensesTotal.toFixed(2)}</span>
									</div>
								{/if}
								<div class="flex justify-between">
									<span class="text-gray-600">{adminFeeLabel}</span>
									<span class="font-medium">${adminFeeAmount.toFixed(2)}</span>
								</div>
								<Separator class="my-2" />
								<div class="flex justify-between text-base font-semibold">
									<span>Invoice Total</span>
									<span>${invoiceTotal.toFixed(2)}</span>
								</div>
								{#if pendingExpenses.length > 0}
									<p class="pt-1 text-xs text-amber-700">
										{pendingExpenses.length} pending expense{pendingExpenses.length === 1
											? ''
											: 's'} must be resolved before this timesheet can be approved.
									</p>
								{/if}
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

				<!-- Expenses / Incidentals -->
				<Card>
					<CardHeader>
						<div class="flex items-center justify-between">
							<div>
								<CardTitle class="flex items-center gap-2">
									<Receipt class="h-5 w-5" />
									Expenses & Incidentals
								</CardTitle>
								<CardDescription>
									Submitted reimbursements. Approved expenses are added to the invoice as separate
									line items.
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent class="space-y-4">
						{#if !isApproved && !isVoid}
							<form
								method="POST"
								action="?/addExpense"
								use:addExpenseEnhance
								class="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-end"
							>
								<div class="flex-1">
									<Label for="addExpenseDescription" class="text-xs">Description</Label>
									<Input
										id="addExpenseDescription"
										name="description"
										bind:value={$addExpenseFormData.description}
										placeholder="e.g. Parking, supplies, mileage"
										disabled={$addExpenseSubmitting}
										required
									/>
								</div>
								<div class="w-full sm:w-32">
									<Label for="addExpenseAmount" class="text-xs">Amount ($)</Label>
									<Input
										id="addExpenseAmount"
										name="amountDollars"
										type="number"
										step="0.01"
										min="0.01"
										bind:value={$addExpenseFormData.amountDollars}
										placeholder="0.00"
										disabled={$addExpenseSubmitting}
										required
									/>
								</div>
								<Button
									type="submit"
									size="sm"
									class="bg-[#2a93d1] hover:bg-blue-500 sm:w-auto"
									disabled={$addExpenseSubmitting}
								>
									{#if $addExpenseSubmitting}
										<Loader2 class="h-4 w-4 animate-spin" />
										Adding…
									{:else}
										<Plus class="h-4 w-4" />
										Add Expense
									{/if}
								</Button>
							</form>
						{/if}

						{#if expenses.length === 0}
							<p class="text-sm text-gray-500">No expenses submitted for this timesheet.</p>
						{:else}
							<div class="space-y-2">
								{#each expenses as expense (expense.id)}
									<div
										class="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm bg-gray-50"
									>
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium">{expense.description}</p>
											{#if expense.status === 'REJECTED' && expense.rejectionReason}
												<p class="text-xs text-red-700">Rejected: {expense.rejectionReason}</p>
											{/if}
										</div>
										<div class="font-mono text-sm font-semibold">
											${(expense.amountCents / 100).toFixed(2)}
										</div>
										<StatusBadge status={expense.status} />
										{#if expense.status === 'PENDING' && !isApproved && !isVoid}
											<div class="flex gap-1">
												<form method="POST" action="?/approveExpense" use:enhance>
													<input type="hidden" name="expenseId" value={expense.id} />
													<Button
														type="submit"
														size="sm"
														variant="outline"
														class="text-green-700"
														title="Approve"
													>
														<ThumbsUp class="h-4 w-4" />
													</Button>
												</form>
												<Button
													type="button"
													size="sm"
													variant="outline"
													class="text-red-700"
													title="Reject"
													on:click={() => {
														rejectExpenseId = expense.id;
														rejectExpenseReason = '';
													}}
												>
													<ThumbsDown class="h-4 w-4" />
												</Button>
												<form
													method="POST"
													action="?/deleteExpense"
													use:enhance
													on:submit={(e) => {
														if (!confirm('Delete this expense?')) e.preventDefault();
													}}
												>
													<input type="hidden" name="expenseId" value={expense.id} />
													<Button
														type="submit"
														size="sm"
														variant="ghost"
														title="Delete"
													>
														<Trash2 class="h-4 w-4 text-red-700" />
													</Button>
												</form>
											</div>
										{/if}
									</div>
								{/each}
							</div>
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
												<div class="flex flex-wrap justify-end gap-2 pt-2">
													<Button variant="outline" size="sm" on:click={cancelEditing}>
														Cancel
													</Button>
													<Button
														variant="outline"
														size="sm"
														disabled={!canSubmit}
														on:click={() => postTimeEntries('?/adminSaveDraftTimesheet')}
													>
														<Save class="h-4 w-4 mr-2" />
														Save draft
													</Button>
													<Button
														size="sm"
														class="bg-blue-800 hover:bg-blue-900"
														disabled={!canSubmit}
														on:click={() =>
															postTimeEntries(
																isDiscrepancy ? '?/adminResubmitTimesheet' : '?/adminSubmitTimesheet'
															)}
													>
														<CheckCircle2 class="h-4 w-4 mr-2" />
														Submit on behalf
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
									<!-- Read-only view — render EVERY scheduled day, overlaying logged
									hours from hoursRaw where present, so days that are assigned but
									not yet worked (e.g. a Thu/Fri shift later in the week) still show
									as "No hours entered" instead of disappearing. -->
									{@const hoursRawList = data?.timesheet?.hoursRaw ?? []}
									{@const scheduledKeys = new Set(scheduledWorkDays.map((d) => d.dateKey))}
									{@const rowsToShow = [
										...scheduledWorkDays.map(({ dateKey, dayString }) => {
											const entry = hoursRawList.find((e) => e.date === dateKey);
											return {
												dateKey,
												dayString,
												startTime: entry?.startTime ?? null,
												endTime: entry?.endTime ?? null,
												lunchStartTime: entry?.lunchStartTime ?? null,
												lunchEndTime: entry?.lunchEndTime ?? null,
												hours: entry?.hours ?? null,
												hasEntry: !!entry
											};
										}),
										...hoursRawList
											.filter((e) => !scheduledKeys.has(e.date))
											.map((entry) => ({
												dateKey: entry.date,
												dayString: formatFullDate(entry.date),
												startTime: entry.startTime,
												endTime: entry.endTime,
												lunchStartTime: entry.lunchStartTime,
												lunchEndTime: entry.lunchEndTime,
												hours: entry.hours,
												hasEntry: true
											}))
									]}
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
																{#if record?.user}
																{record?.user?.firstName}
																{record?.user?.lastName}
																{:else}
																System (Automated)
																{/if}
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
								This timesheet is in draft status. Edit Hours to fill it in, then <strong>Save
									draft</strong> to record hours without notifying the client, or <strong>Submit on
									behalf</strong> of the professional to send it for approval.
							{:else if isPending}
								This timesheet is pending approval. You can approve, reject, or mark a discrepancy.
							{:else if isDiscrepancy}
								This timesheet has discrepancies. Edit the hours and resubmit.
							{:else if isVoid}
								This timesheet has been voided and its workdays released. A corrected draft
								timesheet will regenerate automatically.
							{:else if isRejected}
								This timesheet has been rejected. You can edit and resubmit.
							{:else if isApproved}
								This timesheet has been approved and an invoice generated. It is locked — to make
								corrections, void it (this also voids the invoice) and a fresh draft timesheet will
								regenerate.
							{/if}
						</p>

						<div class="space-y-2">
							{#if !isEditing && !isApproved && !isVoid}
								<Button on:click={enableEditing} variant="outline" class="w-full gap-2">
									<Edit class="h-4 w-4" />
									<span>Edit Hours</span>
								</Button>
							{#if !isPending}
								<Button
														size="sm"
														class="w-full bg-blue-800 hover:bg-blue-900"
														disabled={!canSubmit}
														on:click={() =>
															postTimeEntries(
																isDiscrepancy ? '?/adminResubmitTimesheet' : '?/adminSubmitTimesheet'
															)}
													>
														<CheckCircle2 class="h-4 w-4 mr-2" />
														Submit on behalf
													</Button>
							{/if}
							{/if}

							{#if isPending && !isEditing}
								<Button
									class="w-full bg-green-700 hover:bg-green-800 gap-2"
									disabled={hasDiscrepancies() || data.hasUnfinishedWorkdays}
									on:click={() => (approvalDialogOpen = true)}
								>
									<CheckCircle2 class="h-4 w-4" />
									<span>Approve Timesheet</span>
								</Button>

								{#if data.hasUnfinishedWorkdays}
									<Alert variant="destructive">
										<AlertCircle class="h-4 w-4" />
										<AlertDescription>
											{data.unfinishedWorkdayCount} assigned workday{data.unfinishedWorkdayCount === 1
												? ''
												: 's'} this week {data.unfinishedWorkdayCount === 1 ? 'has' : 'have'} not ended
											yet. Approval (and invoicing) unlocks once every shift in the Mon–Sun week is over.
										</AlertDescription>
									</Alert>
								{/if}

								{#if hasDiscrepancies()}
									<Button
										variant="outline"
										class="w-full border-amber-200 text-amber-700 hover:bg-amber-50 gap-2"
										disabled={data.hasUnfinishedWorkdays}
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

							{#if !isEditing}
								{#if isApproved && data.invoice}
									<!-- Approved sheets are voided (with their invoice), never deleted. -->
									<Button
										variant="outline"
										class="w-full border-red-200 text-red-700 hover:bg-red-50 gap-2"
										on:click={() => (voidDialogOpen = true)}
									>
										<Ban class="h-4 w-4" />
										<span>Void Timesheet &amp; Invoice</span>
									</Button>
								{:else if !isApproved && !isVoid}
									<!-- Pre-approval only: an error/corrupt sheet that should regenerate. -->
									<Button
										variant="outline"
										class="w-full border-red-200 text-red-700 hover:bg-red-50 gap-2"
										on:click={() => (deleteDialogOpen = true)}
									>
										<Trash2 class="h-4 w-4" />
										<span>Delete Timesheet</span>
									</Button>
								{/if}
							{/if}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	</section>
{:else}
	<!-- CLIENT VIEW -->
	<section class="container mx-auto px-4 py-6 space-y-6">
		<div class="flex flex-wrap justify-between">
			<div>
				<div class="flex flex-wrap items-center gap-3">
					<h1 class="text-2xl font-bold">Timesheet Review</h1>
					<StatusBadge status={data?.timesheet?.status} />
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
								<p class="text-sm text-gray-600">Billable (Hours × Rate)</p>
								<p class="text-xl font-bold">${getCostEstimate()}</p>
							</div>
						</div>

						<div class="rounded-lg border bg-gray-50 p-4">
							<p class="mb-3 text-sm font-medium text-gray-700">Billing Summary</p>
							<div class="space-y-1.5 text-sm">
								{#if overtimeHours > 0}
									<div class="flex justify-between">
										<span class="text-gray-600">Regular hours (40 hrs)</span>
										<span class="font-medium">${regularAmount.toFixed(2)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-600">Overtime ({overtimeHours.toFixed(2)} hrs × 1.5×)</span>
										<span class="font-medium">${overtimeAmount.toFixed(2)}</span>
									</div>
								{:else}
									<div class="flex justify-between">
										<span class="text-gray-600">Billable Hours Total</span>
										<span class="font-medium">${billableSubtotal.toFixed(2)}</span>
									</div>
								{/if}
								{#if approvedExpenses.length > 0}
									<div class="flex justify-between">
										<span class="text-gray-600"
											>Approved Expenses ({approvedExpenses.length})</span
										>
										<span class="font-medium">${approvedExpensesTotal.toFixed(2)}</span>
									</div>
								{/if}
								<div class="flex justify-between">
									<span class="text-gray-600">{adminFeeLabel} <span class="text-xs text-gray-500">Applies to Regular Hours</span></span>
									<span class="font-medium">${adminFeeAmount.toFixed(2)}</span>
								</div>
								<Separator class="my-2" />
								<div class="flex justify-between text-base font-semibold">
									<span>Invoice Total</span>
									<span>${invoiceTotal.toFixed(2)}</span>
								</div>
								{#if pendingExpenses.length > 0}
									<p class="pt-1 text-xs text-amber-700">
										{pendingExpenses.length} pending expense{pendingExpenses.length === 1
											? ''
											: 's'} must be resolved before this timesheet can be approved.
									</p>
								{/if}
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

				<Card>
					<CardHeader>
						<CardTitle class="flex items-center gap-2">
							<Receipt class="h-5 w-5" />
							Expenses & Incidentals
						</CardTitle>
						<CardDescription>
							Submitted by the candidate. Approved items will be added to the invoice as separate
							line items.
						</CardDescription>
					</CardHeader>
					<CardContent class="space-y-2">
						{#if expenses.length === 0}
							<p class="text-sm text-gray-500">No expenses submitted for this timesheet.</p>
						{:else}
							{#each expenses as expense (expense.id)}
								<div
									class="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
									class:bg-amber-50={expense.status === 'PENDING'}
									class:bg-green-50={expense.status === 'APPROVED'}
									class:bg-red-50={expense.status === 'REJECTED'}
								>
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium">{expense.description}</p>
										{#if expense.status === 'REJECTED' && expense.rejectionReason}
											<p class="text-xs text-red-700">Rejected: {expense.rejectionReason}</p>
										{/if}
									</div>
									<div class="font-mono text-sm font-semibold">
										${(expense.amountCents / 100).toFixed(2)}
									</div>
									<StatusBadge status={expense.status} />
									{#if expense.status === 'PENDING' && !isApproved && !isVoid}
										<div class="flex gap-1">
											<form method="POST" action="?/approveExpense" use:enhance>
												<input type="hidden" name="expenseId" value={expense.id} />
												<Button
													type="submit"
													size="sm"
													variant="outline"
													class="text-green-700"
													title="Approve"
												>
													<ThumbsUp class="h-4 w-4" />
												</Button>
											</form>
											<Button
												type="button"
												size="sm"
												variant="outline"
												class="text-red-700"
												title="Reject"
												on:click={() => {
													rejectExpenseId = expense.id;
													rejectExpenseReason = '';
												}}
											>
												<ThumbsDown class="h-4 w-4" />
											</Button>
										</div>
									{/if}
								</div>
							{/each}
						{/if}
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
										{@const recurrenceDay = data?.recurrenceDays.find((day) => day.date === entry.date)}
										<div class="py-3 grid grid-cols-12 items-center">
											<div class="col-span-4">
												<p class="font-medium">
													{entry.date}
												</p>
											</div>
											<div class="col-span-3">
												<p class="text-sm text-gray-600">
													{formatTimeInReqZone(entry.startTime)} -{' '}
													{formatTimeInReqZone(entry.endTime)}
												</p>
											</div>
											<div class="col-span-3">
												<p class="text-sm text-gray-600">
													{#if recurrenceDay}
														{formatTimeInReqZone(recurrenceDay.dayStart)} - {formatTimeInReqZone(recurrenceDay.dayEnd)}
													{:else}
														—
													{/if}
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
				{#if isPending}
					<!-- Clients can only act on a submitted (PENDING) timesheet. -->
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
									disabled={hasDiscrepancies() || data.hasUnfinishedWorkdays}
								>
									<CheckCircle2 class="h-4 w-4" />
									<span>Approve Timesheet</span>
								</Button>

								<Button
									variant="outline"
									class="w-full border-red-200 text-red-700 hover:bg-red-50 gap-2"
									on:click={() => (rejectionDialogOpen = true)}
								>
									<X class="h-4 w-4" />
									<span>Reject Timesheet</span>
								</Button>
							</div>

							{#if data.hasUnfinishedWorkdays}
								<Alert variant="destructive" class="mt-3">
									<AlertCircle class="h-4 w-4" />
									<AlertDescription>
										{data.unfinishedWorkdayCount} assigned workday{data.unfinishedWorkdayCount === 1
											? ''
											: 's'} this week {data.unfinishedWorkdayCount === 1 ? 'has' : 'have'} not ended
										yet. Approval unlocks once every shift in the Mon–Sun week is over.
									</AlertDescription>
								</Alert>
							{/if}

							{#if hasDiscrepancies()}
								<Alert variant="default" class="mt-3">
									<AlertCircle class="h-4 w-4" />
									<AlertDescription>This timesheet has unresolved discrepancies.</AlertDescription>
								</Alert>
							{/if}
						</CardContent>
					</Card>
				{:else if isApproved}
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
											parseISO(
												(data?.timesheet?.approvedAt ?? data?.timesheet?.updatedAt).toISOString()
											),
											'MMM d, yyyy'
										)}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				{:else}
					<!-- Not awaiting the client: draft not yet submitted, sent back, voided, etc. -->
					<Card>
						<CardHeader>
							<CardTitle>Approval Status</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="p-4 bg-gray-50 rounded-lg flex items-start gap-3">
								<AlertCircle class="h-5 w-5 text-gray-500 mt-0.5" />
								<div>
									<p class="font-medium text-gray-800">Not awaiting your review</p>
									<p class="text-sm text-gray-600">
										{#if isDraft}
											This timesheet hasn't been submitted yet.
										{:else if isDiscrepancy}
											This timesheet was sent back and is awaiting correction.
										{:else if isVoid}
											This timesheet has been voided.
										{:else if isRejected}
											This timesheet was rejected.
										{:else}
											This timesheet is not currently awaiting approval.
										{/if}
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

<!-- Shared Dialogs (admin + client + client-staff) -->
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

<Dialog bind:open={voidDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Void Timesheet &amp; Invoice</DialogTitle>
			<DialogDescription>
				This voids the timesheet and its invoice (the {data.invoice?.invoiceType === 'PAPER'
					? 'paper'
					: 'Stripe'} invoice will no longer be payable), clears the wages status, and releases the
				workdays so a corrected timesheet can regenerate. This cannot be undone.
			</DialogDescription>
		</DialogHeader>
		<DialogFooter class="mt-4">
			<form method="POST" action="?/voidTimesheet" use:enhance>
				<Button type="button" variant="outline" on:click={() => (voidDialogOpen = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="default"
					class="bg-red-600 hover:bg-red-700 text-white"
					on:click={() => (voidDialogOpen = false)}
				>
					Void Timesheet &amp; Invoice
				</Button>
			</form>
		</DialogFooter>
	</DialogContent>
</Dialog>

<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Delete Timesheet</DialogTitle>
			<DialogDescription>
				This permanently deletes the timesheet and releases its workdays (no invoice is attached).
				A fresh timesheet will regenerate from the released workdays. This cannot be undone.
			</DialogDescription>
		</DialogHeader>
		<DialogFooter class="mt-4">
			<form method="POST" action="?/deleteTimesheet" use:enhance>
				<Button type="button" variant="outline" on:click={() => (deleteDialogOpen = false)}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="default"
					class="bg-red-600 hover:bg-red-700 text-white"
					on:click={() => (deleteDialogOpen = false)}
				>
					Delete Timesheet
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

<Dialog
	open={rejectExpenseId !== null}
	onOpenChange={(open) => {
		if (!open) {
			rejectExpenseId = null;
			rejectExpenseReason = '';
		}
	}}
>
	<DialogContent>
		<form
			method="POST"
			action="?/rejectExpense"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						rejectExpenseId = null;
						rejectExpenseReason = '';
					}
					await update();
				};
			}}
		>
			<DialogHeader>
				<DialogTitle>Reject Expense</DialogTitle>
				<DialogDescription>
					Provide a reason so the candidate can understand why this expense was rejected.
				</DialogDescription>
			</DialogHeader>

			<input type="hidden" name="expenseId" value={rejectExpenseId ?? ''} />
			<div class="py-4">
				<Label for="rejectExpenseReason" class="text-sm font-medium">
					Reason <span class="text-red-500">*</span>
				</Label>
				<Textarea
					id="rejectExpenseReason"
					name="reason"
					bind:value={rejectExpenseReason}
					placeholder="Explain why this expense is being rejected..."
					class="mt-2 min-h-[100px]"
					required
				/>
			</div>

			<DialogFooter>
				<Button
					type="button"
					variant="outline"
					on:click={() => {
						rejectExpenseId = null;
						rejectExpenseReason = '';
					}}
				>
					Cancel
				</Button>
				<Button type="submit" variant="destructive" disabled={!rejectExpenseReason.trim()}>
					Reject Expense
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>

{#if user?.role === USER_ROLES.SUPERADMIN}
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
{/if}
