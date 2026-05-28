<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import { Card } from 'flowbite-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		Briefcase,
		CalendarClock,
		ChevronDown,
		MapPin,
		CircleDollarSign,
		AlertCircle,
		Building,
		ClipboardList,
		Users,
		Loader2,
		Edit,
		X,
		Clock,
		ChevronUp,
		CreditCard,
		Plus,
		Trash2
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type {
		NewRecurrenceDaySchema,
		ChangeStatusSchema,
		DeleteRecurrenceDaySchema
	} from '$lib/config/zod-schemas';
	import { format, parse } from 'date-fns';
	import { cn } from '$lib/utils';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
	import ViewLink from '$lib/components/tables/ViewLink.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import type {
		ApplicationResults,
		TimeSheetResults
	} from '$lib/server/database/queries/requisitions';
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import * as Table from '$lib/components/ui/table';
	import type { RecurrenceDaySelect } from '$lib/server/database/schemas/requisition';
	import WorkDayActionMenu from '$lib/components/dashboard/shared/workday-action-menu.svelte';
	import { USER_ROLES } from '$lib/config/constants';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '$lib/components/ui/alert-dialog';
	import AddRecurrenceDaysDrawer from '$lib/components/drawers/addRecurrenceDaysDrawer.svelte';
	import TimesheetActionMenu from './timesheet-table-actions.svelte';
	import { CardHeader, CardTitle, CardContent, CardDescription } from '$lib/components/ui/card';
	import {
		DropdownMenu,
		DropdownMenuTrigger,
		DropdownMenuContent,
		DropdownMenuItem
	} from '$lib/components/ui/dropdown-menu';
	import TableBody from '$lib/components/ui/table/table-body.svelte';
	import TableCell from '$lib/components/ui/table/table-cell.svelte';
	import TableHead from '$lib/components/ui/table/table-head.svelte';
	import TableHeader from '$lib/components/ui/table/table-header.svelte';
	import TableRow from '$lib/components/ui/table/table-row.svelte';
	import { formatInTimeZone } from 'date-fns-tz';
	import { enhance } from '$app/forms';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';

	export let data: PageData;

	$: user = data.user;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;
	$: company = data.company;
	$: requisition = data.requisition;
	$: recurrenceDays = data.recurrenceDays;
	$: location = data.location;
	$: applications = data.applications;
	$: status = requisition?.status;
	$: hasRequisitionRights = data.hasRequisitionRights;
	$: disciplines = data.disciplines || [];
	$: experienceLevels = data.experienceLevels || [];
	$: locations = data.locations || [];

	// Edit panel state
	let editPanelOpen = false;
	let editSaving = false;
	let applicationTableData: ApplicationResults[] = [];
	let recurrenceDaysTableData: RecurrenceDaySelect[] = [];
	let timesheetTableData: TimeSheetResults[] = [];
	let selectedWorkDayStatus: 'OPEN' | 'FILLED' | 'UNFULFILLED' | 'CANCELED' = 'OPEN';

	export let changeStatusForm: SuperValidated<ChangeStatusSchema>;
	export let recurrenceDayForm: SuperValidated<NewRecurrenceDaySchema>;
	export let deleteRecurrenceDayForm: SuperValidated<DeleteRecurrenceDaySchema>;

	$: filteredRecurrenceDays = recurrenceDaysTableData.filter(
		(day) => day.status === selectedWorkDayStatus
	);

	// Bulk-action selection state for the workday table. Selection scope is the
	// currently visible (status-filtered) list — clearing the filter clears the
	// selection so we never act on rows the user can't see.
	let selectedRecurrenceDayIds = new Set<string>();
	$: visibleIds = filteredRecurrenceDays.map((d) => d.id);
	$: {
		// Drop any selected ids that aren't in the visible set (e.g. after switching
		// status filter). Reassigning the Set keeps reactivity working.
		const stillVisible = new Set<string>();
		for (const id of selectedRecurrenceDayIds) {
			if (visibleIds.includes(id)) stillVisible.add(id);
		}
		if (stillVisible.size !== selectedRecurrenceDayIds.size) {
			selectedRecurrenceDayIds = stillVisible;
		}
	}
	$: selectedCount = selectedRecurrenceDayIds.size;
	$: allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedRecurrenceDayIds.has(id));
	$: headerCheckboxState = allVisibleSelected
		? true
		: selectedCount > 0
			? 'indeterminate'
			: false;

	function toggleRecurrenceDay(id: string) {
		const next = new Set(selectedRecurrenceDayIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedRecurrenceDayIds = next;
	}

	function toggleAllRecurrenceDays() {
		if (allVisibleSelected) {
			selectedRecurrenceDayIds = new Set();
		} else {
			selectedRecurrenceDayIds = new Set(visibleIds);
		}
	}

	let bulkDeleteDialogOpen = false;
	let bulkActionSubmitting = false;

	$: {
		applicationTableData = (applications as ApplicationResults[]) || [];
		applicationsOptions.update((o) => ({ ...o, data: applicationTableData }));
	}

	$: {
		recurrenceDaysTableData = (recurrenceDays as RecurrenceDaySelect[]) ?? [];
	}

	$: {
		recurrenceDaysOptions.update((o) => ({ ...o, data: filteredRecurrenceDays }));
	}
	$: sortedExperienceLevels = [...experienceLevels].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0)
	);

	const recurrenceDaysColumns: ColumnDef<RecurrenceDaySelect>[] = [
		{
			header: '',
			id: 'id',
			accessorFn: (original) => original.id,
			cell: (original) =>
				flexRender(ViewLink, {
					href: `/requisitions/${requisition.id}/workday/${original.getValue()}`
				})
		},
		{
			header: 'Date',
			accessorFn: (original) =>
				new Date(original.date).toLocaleDateString('en-US', { timeZone: 'UTC' })
		},
		{
			header: 'Working Hours',
			accessorFn: (original) =>
				`${formatInTimeZone(original.dayStart, requisition.referenceTimezone, 'h:mm a')} - ${formatInTimeZone(original.dayEnd, requisition.referenceTimezone, 'h:mm a')}`
		},
		{
			header: 'Status',
			accessorKey: 'status',
			cell: (original) =>
				flexRender(StatusBadge, { status: original.getValue() as string })
		},
		{
			header: 'Actions',
			id: 'actions',
			cell: () => flexRender(WorkDayActionMenu, { href: '' })
		}
	];

	const applicationColumns: ColumnDef<ApplicationResults>[] = [
		{
			header: '',
			id: 'id',
			accessorFn: (original) => original.application.id,
			cell: (original) =>
				flexRender(ViewLink, {
					href: `/requisitions/${requisition.id}/application/${original.getValue()}`
				})
		},
		{
			header: 'Applicant Name',
			id: 'title',
			accessorFn: (original) => `${original.user.lastName}, ${original.user.firstName}`
		},
		{
			header: 'Date Submitted',
			id: 'createdAt',
			accessorFn: (original) => original.application.createdAt,
			cell: (original) => format(original.getValue() as Date, 'PPp')
		},
		{
			header: 'Status',
			id: 'status',
			accessorFn: (original) => original.application.status,
			cell: (original) =>
				flexRender(StatusBadge, { status: original.getValue() as string })
		}
	];

	const timesheetColumns: ColumnDef<TimeSheetResults>[] = [
		{
			header: '',
			id: 'id',
			accessorFn: (original) => original.timeSheet.id,
			cell: (original) => flexRender(ViewLink, { href: `/timesheets/${original.getValue()}` })
		},
		{
			header: 'Candidate',
			id: 'employee',
			accessorFn: (original) => `${original.user.lastName}, ${original.user.firstName}`
		},
		{
			header: 'Week Beginning',
			id: 'weekBegin',
			accessorFn: (original) =>
				format(parse(original.timeSheet.weekBeginDate, 'yyyy-MM-dd', new Date()), 'PP')
		},
		{
			header: 'Hours Worked',
			id: 'hoursWorked',
			accessorFn: (original) => original.timeSheet.totalHoursWorked
		},
		{
			header: 'Hours Billed',
			id: 'hoursBilled',
			accessorFn: (original) => original.timeSheet.totalHoursBilled
		},
		{
			header: 'Status',
			id: 'status',
			accessorFn: (original) => original.timeSheet.status,
			cell: (original) =>
				flexRender(StatusBadge, { status: original.getValue() as string })
		},
		{
			header: 'Actions',
			id: 'actions',
			cell: (info) =>
				flexRender(TimesheetActionMenu, {
					timesheetId: info.row.original.timeSheet.id,
					isValidated: info.row.original.timeSheet.validated
				})
		}
	];

	const applicationsOptions = writable<TableOptions<ApplicationResults>>({
		data: applicationTableData,
		columns: applicationColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});
	const recurrenceDaysOptions = writable<TableOptions<RecurrenceDaySelect>>({
		data: filteredRecurrenceDays,
		columns: recurrenceDaysColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});
	const timesheetOptions = writable<TableOptions<TimeSheetResults>>({
		data: timesheetTableData,
		columns: timesheetColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});

	onMount(() => {
		applicationTableData = (applications as ApplicationResults[]) ?? [];
		applicationsOptions.update((o) => ({ ...o, data: applicationTableData }));
		recurrenceDaysTableData = (recurrenceDays as RecurrenceDaySelect[]) ?? [];
		recurrenceDaysOptions.update((o) => ({ ...o, data: filteredRecurrenceDays }));
		timesheetTableData = (data.timesheets as TimeSheetResults[]) ?? [];
		timesheetOptions.update((o) => ({ ...o, data: timesheetTableData }));
	});

	const applicationsTable = createSvelteTable(applicationsOptions);
	const recurrenceDaysTable = createSvelteTable(recurrenceDaysOptions);
	const timesheetTable = createSvelteTable(timesheetOptions);

	const { enhance: deleteEnhance } = superForm(deleteRecurrenceDayForm);
	const { enhance: statusEnhance, submitting: statusSubmitting } = superForm(changeStatusForm);

	// One-off invoice dialog state (permanent requisitions only). Default the
	// method to whatever the client is set up to use for billing — admins on a
	// Stripe-billed client shouldn't have to flip from PAPER every time.
	let showInvoiceDialog = false;
	let invoiceItems: { description: string; quantity: number; rate: number; amount: number }[] = [
		{ description: '', quantity: 1, rate: 0, amount: 0 }
	];
	let selectedInvoiceMethod: 'STRIPE' | 'PAPER' =
		data.clientInvoiceMethod === 'PAPER' ? 'PAPER' : 'STRIPE';
	const {
		form: invoiceFormStore,
		enhance: invoiceEnhance,
		submitting: invoiceSubmitting,
		errors: invoiceErrors
	} = superForm(data.invoiceForm, {
		dataType: 'json',
		onResult({ result }) {
			if (result.type === 'success') {
				showInvoiceDialog = false;
				invoiceItems = [{ description: '', quantity: 1, rate: 0, amount: 0 }];
			}
		}
	});

	function updateInvoiceItemAmount(index: number) {
		const item = invoiceItems[index];
		item.amount = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
		invoiceItems = [...invoiceItems];
	}

	function addInvoiceItem() {
		invoiceItems = [...invoiceItems, { description: '', quantity: 1, rate: 0, amount: 0 }];
	}

	function removeInvoiceItem(index: number) {
		invoiceItems = invoiceItems.filter((_, i) => i !== index);
	}

	$: $invoiceFormStore.amount = invoiceItems.reduce(
		(total, item) => total + (item.amount || 0),
		0
	);
	$: $invoiceFormStore.items = JSON.stringify(
		invoiceItems.map((item) => ({
			description: item.description,
			quantity: item.quantity,
			rate: String(item.rate),
			amount: item.amount
		}))
	);
	$: $invoiceFormStore.invoiceMethod = selectedInvoiceMethod;
</script>

{#if requisition}
	<section class="container mx-auto px-4 py-6 space-y-4">
		<!-- ── Header card ─────────────────────────────────────────────── -->
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			<!-- Top row: logo + title + status + actions -->
			<div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
				<div class="flex items-center gap-4">
					<div
						class="h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden border bg-gray-50 flex items-center justify-center"
					>
						{#if company?.companyLogo}
							<img
								src={company.companyLogo}
								alt="{company.companyName} logo"
								class="h-full w-full object-contain"
							/>
						{:else}
							<Building class="h-7 w-7 text-gray-400" />
						{/if}
					</div>
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<h1 class="text-2xl font-bold text-gray-900">{requisition.discipline.name}</h1>
							<span class="text-sm text-gray-400 font-normal">Req# {requisition.id}</span>
							<StatusBadge {status} />
						</div>
						<a
							href={`/clients/${requisition.company.clientId}`}
							class="text-sm text-blue-600 hover:underline mt-0.5 block"
						>
							{company?.companyName}
						</a>
					</div>
				</div>

				{#if hasRequisitionRights}
					<div class="flex items-center gap-2 flex-shrink-0">
						{#if requisition.permanentPosition && isAdmin}
							<!-- Invoice creation is the admin's billing workflow (perm only).
							     Clients shouldn't see this — they can't invoice themselves. -->
							<Button
								variant="outline"
								size="sm"
								class="gap-1"
								on:click={() => (showInvoiceDialog = true)}
							>
								<CreditCard class="h-4 w-4" />
								<span>Create Invoice</span>
							</Button>
						{/if}
						<DropdownMenu>
							<DropdownMenuTrigger>
								<Button variant="outline" size="sm" class="gap-1">
									{#if $statusSubmitting}
										<Loader2 class="h-3 w-3 animate-spin" />
										Updating...
									{:else}
										Update status
										<ChevronDown class="h-3 w-3" />
									{/if}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<form method="POST" action="?/changeStatus" use:statusEnhance>
									<input type="hidden" name="requisitionId" value={requisition.id} />
									<DropdownMenuItem>
										<button type="submit" name="status" value="OPEN" class="w-full text-left"
											>Open</button
										>
									</DropdownMenuItem>
									<DropdownMenuItem>
										<button type="submit" name="status" value="CANCELED" class="w-full text-left"
											>Canceled</button
										>
									</DropdownMenuItem>
									<DropdownMenuItem>
										<button type="submit" name="status" value="CLOSED" class="w-full text-left"
											>Closed</button
										>
									</DropdownMenuItem>
									<!-- Perm-only payment-tracking branch. Admin-only because clients
									     shouldn't be able to mark their own payment state. -->
									{#if isAdmin && requisition.permanentPosition}
										<DropdownMenuItem>
											<button
												type="submit"
												name="status"
												value="PAYMENT_REQUIRED"
												class="w-full text-left">Payment Required</button
											>
										</DropdownMenuItem>
										<DropdownMenuItem>
											<button
												type="submit"
												name="status"
												value="PAYMENT_RECEIVED"
												class="w-full text-left">Payment Received</button
											>
										</DropdownMenuItem>
									{/if}
								</form>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				{/if}
			</div>

			<!-- Stat grid -->
			<div class="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
				<div class="bg-gray-50 rounded-md p-3">
					<p class="text-xs text-gray-500 mb-1">Hourly rate</p>
					<p class="text-sm font-semibold text-gray-900">${requisition.hourlyRate}/hr</p>
				</div>
				<div class="bg-gray-50 rounded-md p-3">
					<p class="text-xs text-gray-500 mb-1">Position type</p>
					<p class="text-sm font-semibold text-gray-900">
						{requisition.permanentPosition ? 'Permanent' : 'Temporary'}
					</p>
				</div>
				<div class="bg-gray-50 rounded-md p-3">
					<p class="text-xs text-gray-500 mb-1">Location</p>
					<a
						href={`/clients/${requisition.company.clientId}/locations/${requisition.location.id}`}
						class="text-sm font-semibold text-blue-600 hover:underline"
					>
						{requisition.location.name}
					</a>
				</div>
				<div class="bg-gray-50 rounded-md p-3">
					<p class="text-xs text-gray-500 mb-1">Timezone</p>
					<p class="text-sm font-semibold text-gray-900">{requisition.referenceTimezone}</p>
				</div>
				<div class="bg-gray-50 rounded-md p-3">
					<p class="text-xs text-gray-500 mb-1">Experience</p>
					<p class="text-sm font-semibold text-gray-900">
						{requisition.experienceLevel?.value ?? 'No Preference'}
					</p>
				</div>
				<div class="bg-gray-50 rounded-md p-3">
					<p class="text-xs text-gray-500 mb-1">Discipline</p>
					<p class="text-sm font-semibold text-gray-900">{requisition.discipline.name}</p>
				</div>
			</div>
		</div>

		<!-- ── Tabs ────────────────────────────────────────────────────── -->
		<Tabs class="w-full">
			<TabsList
				class="grid lg:w-fit bg-muted h-fit {requisition.permanentPosition
					? 'grid-cols-2'
					: 'grid-cols-3'}"
			>
				<TabsTrigger value="details" class="data-[state=active]:bg-background">Details</TabsTrigger>
				{#if requisition.permanentPosition}
					<TabsTrigger value="applications" class="data-[state=active]:bg-background"
						>Applications</TabsTrigger
					>
				{:else}
					<TabsTrigger value="workdays" class="data-[state=active]:bg-background"
						>Work days</TabsTrigger
					>
					<TabsTrigger value="timesheets" class="data-[state=active]:bg-background"
						>Timesheets</TabsTrigger
					>
				{/if}
			</TabsList>

			<!-- Details tab -->
			<TabsContent value="details" class="mt-4">
				<Card class="max-w-none">
					<CardHeader class="flex flex-row items-center justify-between">
						<div>
							<CardTitle>Details</CardTitle>
							<CardDescription>Job description and requirements</CardDescription>
						</div>
						{#if hasRequisitionRights}
							<Button
								variant="outline"
								size="sm"
								class="gap-1"
								on:click={() => (editPanelOpen = !editPanelOpen)}
							>
								{#if editPanelOpen}
									<X class="h-3 w-3" />
									Cancel
								{:else}
									<Edit class="h-3 w-3" />
									Edit
								{/if}
							</Button>
						{/if}
					</CardHeader>
					<CardContent>
						{#if editPanelOpen}
							<form
								method="POST"
								action="?/updateRequisition"
								use:enhance={() => {
									editSaving = true;
									return async ({ result, update }) => {
										editSaving = false;
										if (result.type === 'success' || result.type === 'redirect') {
											editPanelOpen = false;
										}
										await update();
									};
								}}
							>
								<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
									<div>
										<Label for="edit-discipline" class="text-xs text-gray-600">Discipline</Label>
										<select
											id="edit-discipline"
											name="disciplineId"
											class="mt-1 w-full p-2 border rounded text-sm"
										>
											{#each disciplines as d}
												<option value={d.id} selected={d.id === requisition.disciplineId}
													>{d.name}</option
												>
											{/each}
										</select>
									</div>
									<div>
										<Label for="edit-experience" class="text-xs text-gray-600"
											>Experience level</Label
										>
										<select
											id="edit-experience"
											name="experienceLevelId"
											class="mt-1 w-full p-2 border rounded text-sm"
										>
											<option value="">No Preference</option>
											{#each sortedExperienceLevels as l}
												<option value={l.id} selected={l.id === requisition.experienceLevelId}
													>{l.value}</option
												>
											{/each}
										</select>
									</div>
									<div>
										<Label for="edit-rate" class="text-xs text-gray-600">Hourly rate</Label>
										<Input
											id="edit-rate"
											name="hourlyRate"
											type="number"
											value={requisition.hourlyRate}
											class="mt-1 text-sm"
										/>
									</div>
									<div>
										<Label for="edit-rate" class="text-xs text-gray-600">Purchase Order #</Label>
										<Input
											id="edit-po-number"
											name="purchaseOrderNumber"
											type="text"
											bind:value={requisition.purchaseOrderNumber}
											class="mt-1 text-sm"
										/>
									</div>
								</div>
								<div class="mb-4">
									<Label for="edit-jd" class="text-xs text-gray-600">Job description</Label>
									<Textarea
										id="edit-jd"
										name="jobDescription"
										value={requisition.jobDescription}
										class="mt-1 text-sm min-h-[100px]"
									/>
								</div>
								<div class="mb-5">
									<Label for="edit-si" class="text-xs text-gray-600">Special instructions</Label>
									<Textarea
										id="edit-si"
										name="specialInstructions"
										value={requisition.specialInstructions ?? ''}
										class="mt-1 text-sm"
									/>
								</div>

								<div class="flex justify-end gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										on:click={() => {
											editPanelOpen = false;
											showTimezoneWarning = false;
										}}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										size="sm"
										class="bg-blue-900 hover:bg-blue-800"
										disabled={editSaving}
									>
										{#if editSaving}
											<Loader2 class="h-3 w-3 mr-1 animate-spin" />
											Saving...
										{:else}
											Save changes
										{/if}
									</Button>
								</div>
							</form>
						{:else}
							<div class="space-y-6">
								<div>
									<p class="text-xs text-gray-500 mb-2 uppercase tracking-wide">Job description</p>
									<p class="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
										{requisition.jobDescription}
									</p>
								</div>
								{#if requisition.specialInstructions}
									<div class="border-t pt-5">
										<p class="text-xs text-gray-500 mb-2 uppercase tracking-wide">
											Special instructions
										</p>
										<p class="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
											{requisition.specialInstructions}
										</p>
									</div>
								{/if}
								<div>
									<p class="text-xs text-gray-500 mb-2 uppercase tracking-wide">Purchase Order #</p>
									<p class="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
										{requisition.purchaseOrderNumber ?? '—'}
									</p>
								</div>
							</div>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<!-- Applications tab -->
			{#if requisition.permanentPosition}
				<TabsContent value="applications" class="mt-4">
					<Card class="max-w-none">
						<CardHeader>
							<CardTitle>Applications</CardTitle>
							<CardDescription>Manage applications for this requisition</CardDescription>
						</CardHeader>
						<CardContent>
							{#if applicationTableData.length === 0}
								<div class="text-center py-10">
									<Users class="h-12 w-12 mx-auto text-gray-300" />
									<h3 class="mt-4 text-lg font-medium">No applications yet</h3>
									<p class="mt-2 text-sm text-gray-500">
										Applications will appear here once submitted.
									</p>
								</div>
							{:else}
								<div class="rounded-md border">
									<Table.Root>
										<TableHeader>
											{#each $applicationsTable.getHeaderGroups() as headerGroup}
												<TableRow>
													{#each headerGroup.headers as header}
														<TableHead>
															<svelte:component
																this={flexRender(
																	header.column.columnDef.header,
																	header.getContext()
																)}
															/>
														</TableHead>
													{/each}
												</TableRow>
											{/each}
										</TableHeader>
										<TableBody>
											{#each $applicationsTable.getRowModel().rows as row}
												<TableRow>
													{#each row.getVisibleCells() as cell}
														<TableCell>
															<svelte:component
																this={flexRender(cell.column.columnDef.cell, cell.getContext())}
															/>
														</TableCell>
													{/each}
												</TableRow>
											{/each}
										</TableBody>
									</Table.Root>
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>
			{/if}

			<!-- Work days tab -->
			{#if !requisition.permanentPosition}
				<TabsContent value="workdays" class="mt-4">
					<Card class="max-w-none">
						<CardHeader class="flex flex-row items-center justify-between">
							<div>
								<CardTitle>Work days</CardTitle>
								<CardDescription>Manage scheduled work days</CardDescription>
							</div>
							{#if hasRequisitionRights}
								<AddRecurrenceDaysDrawer
									{location}
									form={recurrenceDayForm}
									{company}
									{requisition}
								/>
							{/if}
						</CardHeader>
						<CardContent>
							{#if recurrenceDaysTableData.length === 0}
								<div class="text-center py-10">
									<CalendarClock class="h-12 w-12 mx-auto text-gray-300" />
									<h3 class="mt-4 text-lg font-medium">No work days scheduled</h3>
									<p class="mt-2 text-sm text-gray-500">Add work days using the button above.</p>
								</div>
							{:else}
								<div class="mb-4 flex flex-wrap gap-2">
									{#each ['OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'] as s}
										<Button
											variant={selectedWorkDayStatus === s ? 'default' : 'outline'}
											size="sm"
											on:click={() => {
												if (s === 'OPEN') selectedWorkDayStatus = 'OPEN';
												else if (s === 'FILLED') selectedWorkDayStatus = 'FILLED';
												else if (s === 'UNFULFILLED') selectedWorkDayStatus = 'UNFULFILLED';
												else if (s === 'CANCELED') selectedWorkDayStatus = 'CANCELED';
											}}
											class={cn(
												selectedWorkDayStatus === s &&
													s === 'OPEN' &&
													'bg-blue-500 hover:bg-blue-600',
												selectedWorkDayStatus === s &&
													s === 'FILLED' &&
													'bg-green-500 hover:bg-green-600',
												selectedWorkDayStatus === s &&
													s === 'UNFULFILLED' &&
													'bg-orange-500 hover:bg-orange-600',
												selectedWorkDayStatus === s &&
													s === 'CANCELED' &&
													'bg-red-500 hover:bg-red-600'
											)}
										>
											{s.charAt(0) + s.slice(1).toLowerCase()} — {recurrenceDaysTableData.filter(
												(d) => d.status === s
											).length}
										</Button>
									{/each}
								</div>

								{#if filteredRecurrenceDays.length === 0}
									<div class="text-center py-10 border rounded-md">
										<CalendarClock class="h-12 w-12 mx-auto text-gray-300" />
										<p class="mt-4 text-sm text-gray-500">
											No {selectedWorkDayStatus.toLowerCase()} work days.
										</p>
									</div>
								{:else}
									<!-- Bulk-action toolbar — only renders when at least one row is selected. -->
									{#if selectedCount > 0 && hasRequisitionRights}
										<div
											class="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-md border bg-muted/40"
										>
											<span class="text-sm font-medium">
												{selectedCount} selected
											</span>
											<div class="ml-auto flex flex-wrap gap-2">
												<!-- Bulk status flip (non-destructive): OPEN / FILLED / UNFULFILLED.
												     CANCELED is handled by the dedicated Cancel button below so the
												     server-side notifications + audit fire on cancel. -->
												<DropdownMenu>
													<DropdownMenuTrigger>
														<Button variant="outline" size="sm" class="gap-1">
															Set Status
															<ChevronDown class="h-3 w-3" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<form
															method="POST"
															action="?/bulkUpdateRecurrenceDayStatus"
															use:enhance={() => {
																bulkActionSubmitting = true;
																return async ({ result, update }) => {
																	bulkActionSubmitting = false;
																	if (result.type === 'success') {
																		selectedRecurrenceDayIds = new Set();
																	}
																	await update();
																};
															}}
														>
															<input
																type="hidden"
																name="ids"
																value={Array.from(selectedRecurrenceDayIds).join(',')}
															/>
															<DropdownMenuItem>
																<button type="submit" name="status" value="OPEN" class="w-full text-left">
																	Open
																</button>
															</DropdownMenuItem>
															<DropdownMenuItem>
																<button type="submit" name="status" value="FILLED" class="w-full text-left">
																	Filled
																</button>
															</DropdownMenuItem>
															<DropdownMenuItem>
																<button type="submit" name="status" value="UNFULFILLED" class="w-full text-left">
																	Unfulfilled
																</button>
															</DropdownMenuItem>
														</form>
													</DropdownMenuContent>
												</DropdownMenu>

												<!-- Cancel — available to both admin and client. Triggers the same
												     per-row cancellation path so notifications still fire. -->
												<form
													method="POST"
													action="?/bulkCancelRecurrenceDays"
													use:enhance={() => {
														bulkActionSubmitting = true;
														return async ({ result, update }) => {
															bulkActionSubmitting = false;
															if (result.type === 'success') {
																selectedRecurrenceDayIds = new Set();
															}
															await update();
														};
													}}
												>
													<input
														type="hidden"
														name="ids"
														value={Array.from(selectedRecurrenceDayIds).join(',')}
													/>
													<Button
														type="submit"
														variant="outline"
														size="sm"
														class="border-orange-400 text-orange-700 hover:bg-orange-50"
														disabled={bulkActionSubmitting}
													>
														<X class="h-3 w-3 mr-1" /> Cancel
													</Button>
												</form>

												<!-- Delete — admin only. Confirmation required. -->
												{#if isAdmin}
													<Button
														type="button"
														variant="outline"
														size="sm"
														class="border-red-400 text-red-700 hover:bg-red-50"
														disabled={bulkActionSubmitting}
														on:click={() => (bulkDeleteDialogOpen = true)}
													>
														<Trash2 class="h-3 w-3 mr-1" /> Delete
													</Button>
												{/if}
											</div>
										</div>
									{/if}

									<div class="rounded-md border">
										<Table.Root>
											<TableHeader>
												{#each $recurrenceDaysTable.getHeaderGroups() as headerGroup}
													<TableRow>
														{#if hasRequisitionRights}
															<TableHead class="w-10">
																<Checkbox
																	checked={headerCheckboxState}
																	on:click={toggleAllRecurrenceDays}
																/>
															</TableHead>
														{/if}
														{#each headerGroup.headers as header}
															<TableHead>
																<svelte:component
																	this={flexRender(
																		header.column.columnDef.header,
																		header.getContext()
																	)}
																/>
															</TableHead>
														{/each}
													</TableRow>
												{/each}
											</TableHeader>
											<TableBody>
												{#each $recurrenceDaysTable.getRowModel().rows as row}
													<TableRow>
														{#if hasRequisitionRights}
															<TableCell class="w-10">
																<Checkbox
																	checked={selectedRecurrenceDayIds.has(row.original.id)}
																	on:click={() => toggleRecurrenceDay(row.original.id)}
																/>
															</TableCell>
														{/if}
														{#each row.getVisibleCells() as cell}
															<TableCell>
																<svelte:component
																	this={flexRender(cell.column.columnDef.cell, cell.getContext())}
																/>
															</TableCell>
														{/each}
													</TableRow>
												{/each}
											</TableBody>
										</Table.Root>
									</div>
								{/if}
							{/if}
						</CardContent>
					</Card>
				</TabsContent>

				<!-- Timesheets tab -->
				<TabsContent value="timesheets" class="mt-4">
					<Card class="max-w-none">
						<CardHeader>
							<CardTitle>Timesheets</CardTitle>
							<CardDescription>Timesheets associated with this requisition</CardDescription>
						</CardHeader>
						<CardContent>
							{#if timesheetTableData.length === 0}
								<div class="text-center py-10">
									<ClipboardList class="h-12 w-12 mx-auto text-gray-300" />
									<h3 class="mt-4 text-lg font-medium">No timesheets yet</h3>
									<p class="mt-2 text-sm text-gray-500">
										Timesheets will appear here once work days begin.
									</p>
								</div>
							{:else}
								<div class="rounded-md border">
									<Table.Root>
										<TableHeader>
											{#each $timesheetTable.getHeaderGroups() as headerGroup}
												<TableRow>
													{#each headerGroup.headers as header}
														<TableHead>
															<svelte:component
																this={flexRender(
																	header.column.columnDef.header,
																	header.getContext()
																)}
															/>
														</TableHead>
													{/each}
												</TableRow>
											{/each}
										</TableHeader>
										<TableBody>
											{#each $timesheetTable.getRowModel().rows as row}
												<TableRow>
													{#each row.getVisibleCells() as cell}
														<TableCell>
															<svelte:component
																this={flexRender(cell.column.columnDef.cell, cell.getContext())}
															/>
														</TableCell>
													{/each}
												</TableRow>
											{/each}
										</TableBody>
									</Table.Root>
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>
			{/if}
		</Tabs>
	</section>
{:else}
	<section
		class="container mx-auto px-4 py-6 flex flex-col items-center text-center sm:justify-center gap-4"
	>
		<div class="p-8 bg-gray-50 rounded-lg">
			<AlertCircle class="h-12 w-12 mx-auto text-gray-400 mb-4" />
			<h2 class="text-2xl font-bold mb-2">No requisition found</h2>
			<p class="text-gray-500 mb-6">The requested requisition could not be found.</p>
			<Button type="button" on:click={() => window.history.back()}>Go back</Button>
		</div>
	</section>
{/if}

<!-- One-Off Invoice Dialog for permanent requisitions -->
{#if requisition?.permanentPosition}
	<Dialog.Root bind:open={showInvoiceDialog}>
		<Dialog.Content class="sm:max-w-[600px] max-h-screen overflow-y-auto">
			<Dialog.Header>
				<Dialog.Title>Create Invoice for Permanent Requisition</Dialog.Title>
				<Dialog.Description>
					Charge the client for services tied to Req #{requisition.id}
					({requisition.discipline?.name ?? requisition.title ?? 'Permanent position'}). Use the
					notes field to capture the rationale for the charges.
				</Dialog.Description>
			</Dialog.Header>

			<form method="POST" action="?/createInvoice" use:invoiceEnhance>
				<div class="grid gap-4 py-4">
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="invoiceDueDate">Due Date</Label>
							<Input
								id="invoiceDueDate"
								name="dueDate"
								type="date"
								bind:value={$invoiceFormStore.dueDate}
							/>
							{#if $invoiceErrors.dueDate}
								<p class="text-sm text-destructive">{$invoiceErrors.dueDate}</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label>Invoice Method</Label>
							<Select.Root
								selected={{ value: selectedInvoiceMethod, label: selectedInvoiceMethod }}
								onSelectedChange={(v) => {
									if (v?.value === 'PAPER' || v?.value === 'STRIPE') {
										selectedInvoiceMethod = v.value;
									}
								}}
							>
								<Select.Trigger>
									<Select.Value placeholder="Select invoice method" />
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="PAPER">Paper Invoice</Select.Item>
									<Select.Item value="STRIPE">Electronic (Stripe)</Select.Item>
								</Select.Content>
							</Select.Root>
							<input
								type="hidden"
								name="invoiceMethod"
								bind:value={$invoiceFormStore.invoiceMethod}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label>Invoice Items</Label>
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="gap-1"
								on:click={addInvoiceItem}
							>
								<Plus class="h-4 w-4" />
								<span>Add Item</span>
							</Button>
						</div>
						<div class="border rounded-md">
							<Table.Root>
								<TableHeader>
									<TableRow>
										<TableHead>Description</TableHead>
										<TableHead class="w-20">Qty</TableHead>
										<TableHead class="w-24">Rate</TableHead>
										<TableHead class="w-24">Amount</TableHead>
										<TableHead class="w-12"></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each invoiceItems as item, i}
										<TableRow>
											<TableCell>
												<Input bind:value={item.description} placeholder="Item description" />
											</TableCell>
											<TableCell>
												<Input
													type="number"
													bind:value={item.quantity}
													on:input={() => updateInvoiceItemAmount(i)}
													min="1"
												/>
											</TableCell>
											<TableCell>
												<Input
													type="number"
													bind:value={item.rate}
													on:input={() => updateInvoiceItemAmount(i)}
													min="0"
													step="0.01"
												/>
											</TableCell>
											<TableCell>${(item.amount || 0).toFixed(2)}</TableCell>
											<TableCell>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													class="h-8 w-8 p-0 text-destructive hover:text-destructive"
													on:click={() => removeInvoiceItem(i)}
													disabled={invoiceItems.length <= 1}
												>
													<Trash2 class="h-4 w-4" />
												</Button>
											</TableCell>
										</TableRow>
									{/each}
									<TableRow>
										<TableCell colspan={4} class="text-right font-bold">Total:</TableCell>
										<TableCell class="font-bold"
											>${($invoiceFormStore.amount || 0).toFixed(2)}</TableCell
										>
									</TableRow>
								</TableBody>
							</Table.Root>
						</div>
						{#if $invoiceErrors.items}
							<p class="text-sm text-destructive">{$invoiceErrors.items}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="invoiceNotes">Rationale / Notes</Label>
						<Textarea
							id="invoiceNotes"
							name="description"
							bind:value={$invoiceFormStore.description}
							placeholder="Explain what these charges cover (placement fee, retainer, etc.)"
						/>
						{#if $invoiceErrors.description}
							<p class="text-sm text-destructive">{$invoiceErrors.description}</p>
						{/if}
					</div>

					<!-- Hidden form fields -->
					<input type="hidden" name="items" bind:value={$invoiceFormStore.items} />
					<input type="hidden" name="amount" bind:value={$invoiceFormStore.amount} />
				</div>

				<Dialog.Footer>
					<Button type="button" variant="outline" on:click={() => (showInvoiceDialog = false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={$invoiceSubmitting}>
						{#if $invoiceSubmitting}Creating...{:else}Create Invoice{/if}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}

<!-- ─── Bulk Delete Confirm Dialog (admin only) ────────────────────────────── -->
<AlertDialog bind:open={bulkDeleteDialogOpen}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete selected workdays?</AlertDialogTitle>
			<AlertDialogDescription>
				This will permanently archive {selectedCount} workday{selectedCount === 1 ? '' : 's'} and
				their assigned timesheets. This action cannot be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<form
				method="POST"
				action="?/bulkDeleteRecurrenceDays"
				use:enhance={() => {
					bulkActionSubmitting = true;
					return async ({ result, update }) => {
						bulkActionSubmitting = false;
						bulkDeleteDialogOpen = false;
						if (result.type === 'success') {
							selectedRecurrenceDayIds = new Set();
						}
						await update();
					};
				}}
			>
				<input
					type="hidden"
					name="ids"
					value={Array.from(selectedRecurrenceDayIds).join(',')}
				/>
				<AlertDialogAction
					type="submit"
					class="bg-red-500 hover:bg-red-600"
					disabled={bulkActionSubmitting}
				>
					{bulkActionSubmitting ? 'Deleting...' : 'Delete'}
				</AlertDialogAction>
			</form>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
