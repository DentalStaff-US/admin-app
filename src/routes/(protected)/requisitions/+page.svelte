<script lang="ts">
	import {
		getCoreRowModel,
		type ColumnDef,
		getSortedRowModel,
		getPaginationRowModel,
		getFilteredRowModel,
		type TableOptions,
		createSvelteTable,
		flexRender
	} from '@tanstack/svelte-table';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import {
		ArrowUpDown,
		ArrowUp,
		ArrowDown,
		Plus,
		Search,
		Filter,
		Eye,
		ChevronLeft,
		ChevronRight
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import type { PageData } from './$types';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { USER_ROLES } from '$lib/config/constants';
	import {
		type AdminRequisitionSchema,
		type ClientRequisitionSchema
	} from '$lib/config/zod-schemas';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import { formatInTimeZone } from 'date-fns-tz';

	export let data: PageData;

	type RequisitionData = {
		id: string;
		title: string;
		status: string;
		createdAt: Date;
		updatedAt: Date;
		hourlyRate: number;
		permanentPosition: boolean;
		locationName: string;
		companyName: string;
		firstName: string;
		lastName: string;
		email: string;
		disciplineName: string;
		regionName: string;
		regionAbbreviation: string;
		referenceTimezone: string;
		subregionName: string;
		recurrenceDays: { dayStart: Date; dayEnd: Date }[];
	};

	let drawerExpanded = false;
	$: searchTerm = '';
	let activeTab = 'open';

	$: user = data.user;
	$: requisitions = (data.requisitions as RequisitionData[]) || [];
	$: clientForm = data.clientForm as SuperValidated<ClientRequisitionSchema>;
	$: adminForm = data.adminForm as SuperValidated<AdminRequisitionSchema>;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;

	function formatWorkWeek(
		recurrenceDays: { dayStart: Date; dayEnd: Date }[],
		timezone: string
	): string {
		if (!recurrenceDays || recurrenceDays.length === 0) return 'No shifts scheduled';

		function format(date: Date) {
			return formatInTimeZone(new Date(date), timezone, 'MMMM d');
		}

		if (recurrenceDays.length === 1) {
			return format(recurrenceDays[0].dayStart);
		}

		const sorted = [...recurrenceDays].sort(
			(a, b) => new Date(a.dayStart).getTime() - new Date(b.dayStart).getTime()
		);

		const first = format(sorted[0].dayStart);
		const last = format(sorted[sorted.length - 1].dayStart);

		return `${first} – ${last}`;
	}

	// Define columns for different user roles
	const getColumns = (isAdmin: boolean): ColumnDef<RequisitionData>[] => {
		let baseColumns: ColumnDef<RequisitionData>[] = [
			{
				id: 'id',
				header: 'Req #',
				accessorKey: 'id',
				cell: ({ getValue }) => {
					const id = getValue() as string;
					return `#${id}`;
				},
				enableSorting: true
			},
			{
				id: 'discipline',
				header: 'Discipline',
				accessorKey: 'disciplineName',
				cell: ({ getValue, row }) => {
					return getValue() as string;
				},
				enableSorting: true
			},
			{
				id: 'status',
				header: 'Status',
				accessorKey: 'status',
				enableSorting: true
			},
			{
				id: 'type',
				header: 'Type',
				accessorKey: 'permanentPosition',
				cell: ({ getValue, row }) => {
					return getValue() ? 'Permanent' : 'Temporary';
				},
				enableSorting: true
			},
			{
				id: 'rate',
				header: 'Rate',
				accessorKey: 'hourlyRate',
				enableSorting: true
			},
			{
				id: 'location',
				header: 'Location',
				accessorKey: 'locationName',
				enableSorting: true
			},
			{
				id: 'address',
				header: 'Address',
				accessorKey: 'locationAddress',
				enableSorting: true
			},
			{
				id: 'work-week',
				header: 'Work Week',
				accessorFn: (row) => `${formatWorkWeek(row.recurrenceDays, row.referenceTimezone)}`
			}
		];

		if (isAdmin) {
			baseColumns = baseColumns.toSpliced(5, 0, {
				header: 'Client',
				accessorFn: (row) => `${row.lastName}, Dr. ${row.firstName}`,
				id: 'client',
				enableSorting: true
			});
		}
		return baseColumns;
	};

	$: columns = getColumns(isAdmin);

	// Filter requisitions by status
	const filterByStatus = (requisitions: RequisitionData[], status: string) => {
		return requisitions.filter((req) => req.status === status.toUpperCase());
	};

	// Create separate table instances for each tab
	const createTableOptions = (data: RequisitionData[]): TableOptions<RequisitionData> => ({
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

	// Table options for each status
	const openOptions = writable<TableOptions<RequisitionData>>(createTableOptions([]));
	// const filledOptions = writable<TableOptions<RequisitionData>>(createTableOptions([]));
	// const unfulfilledOptions = writable<TableOptions<RequisitionData>>(createTableOptions([]));
	const canceledOptions = writable<TableOptions<RequisitionData>>(createTableOptions([]));

	// Create table instances
	const openTable = createSvelteTable(openOptions);
	// const filledTable = createSvelteTable(filledOptions);
	// const unfulfilledTable = createSvelteTable(unfulfilledOptions);
	const canceledTable = createSvelteTable(canceledOptions);

	// Get current active table
	$: currentTable = activeTab === 'open' ? openTable : canceledTable;

	// Update table data when requisitions change
	$: {
		const openData = filterByStatus(requisitions, 'open');
		// const filledData = filterByStatus(requisitions, 'filled');
		// const unfulfilledData = filterByStatus(requisitions, 'unfulfilled');
		const canceledData = filterByStatus(requisitions, 'canceled');

		openOptions.update((opts) => ({ ...opts, data: openData, columns }));
		// filledOptions.update((opts) => ({ ...opts, data: filledData, columns }));
		// unfulfilledOptions.update((opts) => ({ ...opts, data: unfulfilledData, columns }));
		canceledOptions.update((opts) => ({ ...opts, data: canceledData, columns }));
	}

	onMount(() => {
		const openData = filterByStatus(requisitions, 'open');
		// const filledData = filterByStatus(requisitions, 'filled');
		// const unfulfilledData = filterByStatus(requisitions, 'unfulfilled');
		const canceledData = filterByStatus(requisitions, 'canceled');

		openOptions.update((opts) => ({ ...opts, data: openData, columns }));
		// filledOptions.update((opts) => ({ ...opts, data: filledData, columns }));
		// unfulfilledOptions.update((opts) => ({ ...opts, data: unfulfilledData, columns }));
		canceledOptions.update((opts) => ({ ...opts, data: canceledData, columns }));
	});

	// Get tab counts
	$: tabCounts = {
		open: filterByStatus(requisitions, 'open').length,
		filled: filterByStatus(requisitions, 'filled').length,
		unfulfilled: filterByStatus(requisitions, 'unfulfilled').length,
		canceled: filterByStatus(requisitions, 'canceled').length
	};

	function handleRowClick(requisitionId: string) {
		goto(`/requisitions/${requisitionId}`);
	}

	function handleSearch(searchTerm: string) {
		if (!searchTerm || searchTerm.trim() === '') {
			goto('/requisitions');
		} else {
			goto(`/requisitions?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}
</script>

<section class="container mx-auto px-4 py-6 flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Requisitions</h1>
			<p class="text-muted-foreground">Manage and track job requisitions</p>
		</div>

		<div class="flex items-center gap-3">
			<Button on:click={() => (drawerExpanded = true)} class="bg-blue-800 hover:bg-blue-900">
				<Plus class="h-4 w-4 mr-2" />
				New Requisition
			</Button>
		</div>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search requisitions..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-blue-800 hover:bg-blue-900"
			on:click={() => handleSearch(searchTerm)}>Search</Button
		>
	</form>

	<!-- Tabs with Tables -->
	<Tabs.Root bind:value={activeTab} class="">
		<Tabs.List class="grid w-full grid-cols-4">
			<Tabs.Trigger value="open" class="relative">
				Open
				{#if tabCounts.open > 0}
					<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.open}
					></Badge>
				{/if}
			</Tabs.Trigger>
			<!-- <Tabs.Trigger value="filled" class="relative">
				Filled
				{#if tabCounts.filled > 0}
					<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.filled}
					></Badge>
				{/if}
			</Tabs.Trigger>
			<Tabs.Trigger value="unfulfilled" class="relative">
				Unfulfilled
				{#if tabCounts.unfulfilled > 0}
					<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.unfulfilled}>
						{tabCounts.unfulfilled}
					</Badge>
				{/if}
			</Tabs.Trigger> -->
			<Tabs.Trigger value="canceled" class="relative">
				Canceled
				{#if tabCounts.canceled > 0}
					<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.canceled}>
						{tabCounts.canceled}
					</Badge>
				{/if}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- Tab Contents -->
		{#each ['open', 'canceled'] as tabValue}
			<Tabs.Content value={tabValue} class="">
				{#if activeTab === tabValue}
					<div class="bg-white rounded-lg shadow-sm">
						{#if $currentTable.getFilteredRowModel().rows.length > 0}
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
															>
																{header.column.columnDef.header}
																{#if header.column.getCanSort()}
																	<ArrowUpDown class="ml-2 h-4 w-4" />
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
												on:click={() => handleRowClick(row.original.id)}
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
										$currentTable.getFilteredRowModel().rows.length
									)} of {$currentTable.getFilteredRowModel().rows.length} results
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
							<!-- Empty state -->
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<div
									class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"
								>
									<Filter class="w-8 h-8 text-gray-400" />
								</div>
								<h3 class="text-lg font-medium text-gray-900 mb-2">
									No {activeTab} requisitions found
								</h3>
								<p class="text-sm text-gray-500">
									{#if searchTerm}
										Try adjusting your search terms
									{:else}
										No {activeTab} requisitions available
									{/if}
								</p>
							</div>
						{/if}
					</div>
				{/if}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</section>

<!-- Add Requisition Drawer -->
<AddRequisitionDrawer {user} bind:drawerExpanded {clientForm} {adminForm} />
