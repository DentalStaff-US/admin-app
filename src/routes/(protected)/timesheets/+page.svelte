<script lang="ts">
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import type { PageData } from './$types';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Search,
		ChevronLeft,
		ChevronRight,
		FileClock,
		Eye,
		AlertTriangle,
		Ban
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import { USER_ROLES } from '$lib/config/constants';
	import ViewLink from '$lib/components/tables/ViewLink.svelte';
	import RequisitionCell from '$lib/components/tables/RequisitionCell.svelte';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import type { TimesheetWithRelations } from '$lib/server/database/schemas/requisition';
	import { page } from '$app/stores';

	export let data: PageData;

	let searchTerm = data.searchTerm || '';
	let activeTab = $page.url.searchParams.get('tab') || 'all';

	$: user = data.user;
	$: timesheets = (data.timesheets as TimesheetWithRelations[]) || [];
	$: voidedTimesheets = (data.voidedTimesheets as TimesheetWithRelations[]) || [];
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;

	$: {
		console.log('Timesheets data:', timesheets);
	}

	// Helper function to validate timesheet and check for discrepancies
	function hasDiscrepancies(timesheet: any): boolean {
		// First check the status
		if (timesheet.timesheet.status === 'DISCREPANCY') {
			return true;
		}
		return false;
	}

	// ✅ Filter timesheets by discrepancy status
	const filterByDiscrepancy = (timesheets: any[], hasDiscrepancy: boolean) => {
		if (hasDiscrepancy) {
			// Show only timesheets with discrepancies
			return timesheets.filter((ts) => hasDiscrepancies(ts));
		} else {
			// Show only timesheets without discrepancies and not in DISCREPANCY status
			return timesheets.filter((ts) => !hasDiscrepancies(ts));
		}
	};

	// Column definitions
	const columns: ColumnDef<TimesheetWithRelations>[] = [
		{
			header: '',
			id: 'id',
			accessorKey: 'timesheet.id',
			enableSorting: false,
			cell: ({ getValue }) =>
				flexRender(ViewLink, {
					href: `/timesheets/${getValue()}`
				})
		},
		{
			header: 'Requisition',
			id: 'requisition',
			accessorFn: (row) => row.requisition?.disciplineName || 'N/A',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const titleA = rowA.original.requisition?.disciplineName?.toLowerCase() || '';
				const titleB = rowB.original.requisition?.disciplineName?.toLowerCase() || '';
				return titleA.localeCompare(titleB);
			},
			cell: ({ row }) =>
				flexRender(RequisitionCell, {
					disciplineName: row.original.requisition?.disciplineName,
					requisitionId: row.original.requisition?.id
				})
		},
		{
			header: 'Candidate',
			id: 'candidate',
			accessorFn: (row) => `${row.candidate?.firstName || ''} ${row.candidate?.lastName || ''}`,
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA =
					`${rowA.original.candidate?.firstName || ''} ${rowA.original.candidate?.lastName || ''}`.toLowerCase();
				const nameB =
					`${rowB.original.candidate?.firstName || ''} ${rowB.original.candidate?.lastName || ''}`.toLowerCase();
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Status',
			id: 'status',
			accessorKey: 'timesheet.status',
			enableSorting: true,
			cell: ({ getValue }) => {
				return flexRender(StatusBadge, { status: getValue() as string });
			}
		},
		{
			header: 'Hours Worked',
			id: 'hours',
			accessorKey: 'timesheet.totalHoursWorked',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const hoursA = Number(rowA.original.timesheet.totalHoursWorked) || 0;
				const hoursB = Number(rowB.original.timesheet.totalHoursWorked) || 0;
				return hoursA - hoursB;
			},
			cell: ({ getValue }) => {
				const hours = getValue() as number;
				return `${hours} hrs`;
			}
		},
		{
			header: 'Work Week',
			id: 'workWeek',
			accessorKey: 'timesheet.weekBeginDate',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const dateA = new Date(rowA.original.timesheet.weekBeginDate).getTime();
				const dateB = new Date(rowB.original.timesheet.weekBeginDate).getTime();
				return dateA - dateB;
			},
			cell: ({ getValue }) => {
				const date = getValue() as string;
				if (!date) return '-';
				const start = new Date(date);
				const end = new Date(start);
				end.setUTCDate(start.getUTCDate() + 6);
				const fmt = (d: Date) =>
					d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
				return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
			}
		}
	];

	// Create separate table instances for each tab
	const createTableOptions = (
		data: TimesheetWithRelations[]
	): TableOptions<TimesheetWithRelations> => ({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 10
			}
		}
	});

	// Table options for each tab
	const allOptions = writable<TableOptions<TimesheetWithRelations>>(createTableOptions([]));
	const noDiscrepancyOptions = writable<TableOptions<TimesheetWithRelations>>(
		createTableOptions([])
	);
	const discrepancyOptions = writable<TableOptions<TimesheetWithRelations>>(createTableOptions([]));
	const wagesDueOptions = writable<TableOptions<TimesheetWithRelations>>(createTableOptions([]));
	const wagesPaidOptions = writable<TableOptions<TimesheetWithRelations>>(createTableOptions([]));

	// Create table instances
	const allTable = createSvelteTable(allOptions);
	const noDiscrepancyTable = createSvelteTable(noDiscrepancyOptions);
	const discrepancyTable = createSvelteTable(discrepancyOptions);
	const wagesDueTable = createSvelteTable(wagesDueOptions);
	const wagesPaidTable = createSvelteTable(wagesPaidOptions);

	// Voided timesheets live in their own table, separate from the active tabs.
	const voidedOptions = writable<TableOptions<TimesheetWithRelations>>(createTableOptions([]));
	const voidedTable = createSvelteTable(voidedOptions);
	$: voidedOptions.update((opts) => ({ ...opts, data: voidedTimesheets, columns }));

	// Get current active table
	$: currentTable =
		activeTab === 'all'
			? allTable
			: activeTab === 'no-discrepancy'
				? noDiscrepancyTable
				: activeTab === 'discrepancy'
					? discrepancyTable
					: activeTab === 'wages-due'
						? wagesDueTable
						: activeTab === 'voided'
							? voidedTable
							: wagesPaidTable;

	// Update table data when timesheets change
	$: {
		const allData = timesheets;
		const noDiscrepancyData = filterByDiscrepancy(timesheets, false);
		const discrepancyData = filterByDiscrepancy(timesheets, true);
		const wagesDueData = filterByWagesStatus(timesheets, 'WAGES_DUE');
		const wagesPaidData = filterByWagesStatus(timesheets, 'WAGES_PAID');

		allOptions.update((opts) => ({ ...opts, data: allData, columns }));
		noDiscrepancyOptions.update((opts) => ({ ...opts, data: noDiscrepancyData, columns }));
		discrepancyOptions.update((opts) => ({ ...opts, data: discrepancyData, columns }));
		wagesDueOptions.update((opts) => ({
			...opts,
			data: filterByWagesStatus(timesheets, 'WAGES_DUE'),
			columns
		}));
		wagesPaidOptions.update((opts) => ({
			...opts,
			data: filterByWagesStatus(timesheets, 'WAGES_PAID'),
			columns
		}));
	}

	onMount(() => {
		const allData = timesheets;
		const noDiscrepancyData = filterByDiscrepancy(timesheets, false);
		const discrepancyData = filterByDiscrepancy(timesheets, true);
		const wagesDueData = filterByWagesStatus(timesheets, 'WAGES_DUE');
		const wagesPaidData = filterByWagesStatus(timesheets, 'WAGES_PAID');

		allOptions.update((opts) => ({ ...opts, data: allData, columns }));
		noDiscrepancyOptions.update((opts) => ({ ...opts, data: noDiscrepancyData, columns }));
		discrepancyOptions.update((opts) => ({ ...opts, data: discrepancyData, columns }));
		wagesDueOptions.update((opts) => ({
			...opts,
			data: filterByWagesStatus(timesheets, 'WAGES_DUE'),
			columns
		}));
		wagesPaidOptions.update((opts) => ({
			...opts,
			data: filterByWagesStatus(timesheets, 'WAGES_PAID'),
			columns
		}));
	});

	const filterByWagesStatus = (timesheets: any[], status: 'WAGES_DUE' | 'WAGES_PAID') =>
		timesheets.filter((ts) => ts.timesheet.wagesStatus === status);

	// Add to tabCounts
	$: tabCounts = {
		all: timesheets.length,
		noDiscrepancy: filterByDiscrepancy(timesheets, false).length,
		discrepancy: filterByDiscrepancy(timesheets, true).length,
		wagesDue: filterByWagesStatus(timesheets, 'WAGES_DUE').length,
		wagesPaid: filterByWagesStatus(timesheets, 'WAGES_PAID').length,
		voided: voidedTimesheets.length
	};

	function getSortingIcon(header: any) {
		if (!header.column.getCanSort()) return null;

		const sorted = header.column.getIsSorted();
		if (sorted === 'asc') return ArrowUp;
		if (sorted === 'desc') return ArrowDown;
		return ArrowUpDown;
	}

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/timesheets');
		} else {
			goto(`/timesheets?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}

	function handleRowClick(timesheetId: string) {
		goto(`/timesheets/${timesheetId}`);
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch(searchTerm);
		}
	}
</script>

<svelte:head>
	<title>Timesheets | DTSS</title>
</svelte:head>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6 flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Timesheets</h1>
			<p class="text-muted-foreground">Track and manage timesheet submissions</p>
		</div>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search timesheets..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-blue-800 hover:bg-blue-900"
			on:click={() => handleSearch(searchTerm)}
		>
			Search
		</Button>
	</form>

	{#if timesheets.length === 0}
		<!-- Empty State -->
		<Card.Root class="w-full flex flex-col items-center p-12 border-dashed">
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="rounded-full bg-muted p-4">
					<FileClock class="h-8 w-8 text-muted-foreground" />
				</div>
				<Card.Title class="text-2xl">No timesheets yet</Card.Title>
				<Card.Description class="max-w-[420px] text-center text-muted-foreground">
					{#if searchTerm}
						No timesheets found matching your search terms. Try adjusting your search.
					{:else}
						You haven't received any timesheet submissions yet. When requisitions are submitted,
						timesheets will be submitted by candidates and will appear here.
					{/if}
				</Card.Description>
			</div>
		</Card.Root>
	{:else}
		<!-- Tabs with Tables -->
		<Tabs.Root bind:value={activeTab} class="">
			<Tabs.List class="grid w-full grid-cols-5">
				<Tabs.Trigger value="all" class="relative">
					All Timesheets
					{#if tabCounts.all > 0}
						<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.all}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="no-discrepancy" class="relative">
					No Issues
					{#if tabCounts.noDiscrepancy > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs"
							value={tabCounts.noDiscrepancy}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="discrepancy" class="relative">
					<AlertTriangle class="h-4 w-4 mr-1" />
					Discrepancies
					{#if tabCounts.discrepancy > 0}
						<Badge
							variant="destructive"
							class="ml-2 h-5 min-w-5 text-xs"
							value={tabCounts.discrepancy}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="wages-due" class="relative">
					Wages Due
					{#if tabCounts.wagesDue > 0}
						<Badge class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.wagesDue}></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="voided" class="relative">
					<Ban class="h-4 w-4 mr-1" />
					Voided
					{#if tabCounts.voided > 0}
						<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.voided}
						></Badge>
					{/if}
				</Tabs.Trigger>
			</Tabs.List>

			<!-- Tab Contents -->
			{#each ['all', 'no-discrepancy', 'discrepancy', 'wages-due', 'wages-paid', 'voided'] as tabValue}
				<Tabs.Content value={tabValue} class="">
					{#if activeTab === tabValue}
						<div class="bg-white rounded-lg shadow-sm">
							{#if $currentTable.getRowModel().rows.length > 0}
								<div class="rounded-md border">
									<Table.Root>
										<Table.Header>
											{#each $currentTable.getHeaderGroups() as headerGroup}
												<Table.Row>
													{#each headerGroup.headers as header}
														<Table.Head>
															{#if header.column.columnDef.header}
																<Button
																	variant="ghost"
																	on:click={() =>
																		header.column.toggleSorting(
																			header.column.getIsSorted() === 'asc'
																		)}
																	class="hover:bg-gray-50"
																>
																	{header.column.columnDef.header}
																	{#if header.column.getCanSort()}
																		{#if getSortingIcon(header)}
																			<svelte:component
																				this={getSortingIcon(header)}
																				class="ml-2 h-4 w-4"
																			/>
																		{/if}
																	{/if}
																</Button>
															{/if}
														</Table.Head>
													{/each}
												</Table.Row>
											{/each}
										</Table.Header>
										<Table.Body>
											{#each $currentTable.getRowModel().rows as row}
												<Table.Row
													class="hover:bg-muted/50 cursor-pointer"
													on:click={() => handleRowClick(row.original.timesheet.id)}
												>
													{#each row.getVisibleCells() as cell}
														<Table.Cell>
															<svelte:component
																this={flexRender(cell.column.columnDef.cell, cell.getContext())}
															/>
														</Table.Cell>
													{/each}
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Root>
								</div>

								<!-- Pagination -->
								<div class="flex items-center justify-between space-x-2 p-4 border-t">
									<div class="flex-1 text-sm text-muted-foreground">
										Showing {$currentTable.getState().pagination.pageIndex *
											$currentTable.getState().pagination.pageSize +
											1} to {Math.min(
											($currentTable.getState().pagination.pageIndex + 1) *
												$currentTable.getState().pagination.pageSize,
											$currentTable.getRowModel().rows.length
										)} of {$currentTable.getRowModel().rows.length} timesheets
									</div>
									<div class="flex items-center space-x-2">
										<Button
											variant="outline"
											size="sm"
											on:click={() => $currentTable.previousPage()}
											disabled={!$currentTable.getCanPreviousPage()}
										>
											<ChevronLeft class="h-4 w-4" />
											Previous
										</Button>
										<div class="flex items-center space-x-1">
											<span class="text-sm text-muted-foreground">
												Page {$currentTable.getState().pagination.pageIndex + 1} of {$currentTable.getPageCount()}
											</span>
										</div>
										<Button
											variant="outline"
											size="sm"
											on:click={() => $currentTable.nextPage()}
											disabled={!$currentTable.getCanNextPage()}
										>
											Next
											<ChevronRight class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{:else}
								<!-- Empty state for specific tab -->
								<div class="flex flex-col items-center justify-center py-12 text-center">
									<div
										class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"
									>
										{#if activeTab === 'discrepancy'}
											<AlertTriangle class="w-8 h-8 text-gray-400" />
										{:else}
											<FileClock class="w-8 h-8 text-gray-400" />
										{/if}
									</div>
									<h3 class="text-lg font-medium text-gray-900 mb-2">
										No {activeTab === 'all'
											? 'timesheets'
											: activeTab === 'discrepancy'
												? 'discrepancies'
												: 'clean timesheets'} found
									</h3>
									<p class="text-sm text-gray-500">
										{#if searchTerm}
											Try adjusting your search terms
										{:else if activeTab === 'discrepancy'}
											Great! No timesheet discrepancies at the moment.
										{:else}
											No timesheets in this category yet.
										{/if}
									</p>
								</div>
							{/if}
						</div>
					{/if}
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{/if}
</section>
