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
	import { page } from '$app/stores';
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
		unbilled?: boolean;
	};

	let drawerExpanded = false;
	let searchTerm = data.searchTerm ?? '';

	// One tab per requisition status. Open/Closed/Canceled are always shown; the
	// rest only appear when something is in them (or they're the active tab), so
	// temp-only clients see the same three tabs as before. PENDING and the perm
	// payment statuses used to have no tab at all — those rows were loaded and
	// then silently dropped, which is why "Unbilled Placements" had nowhere to land.
	type TabDef = { value: string; label: string; status: string; always?: boolean };
	const TABS: TabDef[] = [
		{ value: 'open', label: 'Open', status: 'OPEN', always: true },
		{ value: 'pending', label: 'Pending', status: 'PENDING' },
		{ value: 'payment-required', label: 'Payment Required', status: 'PAYMENT_REQUIRED' },
		{ value: 'payment-received', label: 'Payment Received', status: 'PAYMENT_RECEIVED' },
		{ value: 'closed', label: 'Closed', status: 'CLOSED', always: true },
		{ value: 'canceled', label: 'Canceled', status: 'CANCELED', always: true }
	];

	function initialTab(): string {
		const fromUrl = $page.url.searchParams.get('tab');
		if (fromUrl && TABS.some((t) => t.value === fromUrl)) return fromUrl;
		if (data.filter === 'unbilled') return 'payment-required';
		return 'open';
	}
	let activeTab = initialTab();

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
				// `unbilled` is admin-only (perm placement with no live invoice).
				accessorFn: (row) => (row.unbilled ? `${row.status} · Unbilled` : row.status),
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
		return requisitions.filter((req) => req.status === status);
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

	const tableOptions = Object.fromEntries(
		TABS.map((t) => [t.value, writable<TableOptions<RequisitionData>>(createTableOptions([]))])
	);
	const tables = Object.fromEntries(
		TABS.map((t) => [t.value, createSvelteTable(tableOptions[t.value])])
	);

	$: currentTable = tables[activeTab] ?? tables.open;

	function syncTables(rows: RequisitionData[], cols: ColumnDef<RequisitionData>[]) {
		for (const t of TABS) {
			tableOptions[t.value].update((opts) => ({
				...opts,
				data: filterByStatus(rows, t.status),
				columns: cols
			}));
		}
	}

	$: syncTables(requisitions, columns);
	onMount(() => syncTables(requisitions, columns));

	$: tabCounts = Object.fromEntries(
		TABS.map((t) => [t.value, filterByStatus(requisitions, t.status).length])
	) as Record<string, number>;

	$: visibleTabs = TABS.filter((t) => t.always || tabCounts[t.value] > 0 || t.value === activeTab);
	$: activeTabLabel = (TABS.find((t) => t.value === activeTab)?.label ?? activeTab).toLowerCase();

	function handleRowClick(requisitionId: string) {
		goto(`/requisitions/${requisitionId}`);
	}

	// Rebuilds the URL from the current search + filter + tab so searching inside
	// a filtered view (e.g. unbilled) doesn't silently drop the filter.
	function listUrl(opts: { search?: string; filter?: string | null; tab?: string }) {
		const params = new URLSearchParams();
		if (opts.search) params.set('search', opts.search);
		if (opts.filter) params.set('filter', opts.filter);
		if (opts.tab && opts.tab !== 'open') params.set('tab', opts.tab);
		const qs = params.toString();
		return qs ? `/requisitions?${qs}` : '/requisitions';
	}

	function handleSearch(term: string) {
		goto(listUrl({ search: term?.trim(), filter: data.filter, tab: activeTab }));
	}

	function clearFilter() {
		activeTab = 'open';
		goto(listUrl({ search: searchTerm?.trim() }));
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
			{#if data.canCreateRequisitions}
				<Button on:click={() => (drawerExpanded = true)} class="bg-primary hover:bg-primary/90">
					<Plus class="h-4 w-4 mr-2" />
					New Requisition
				</Button>
			{/if}
		</div>
	</div>

	{#if data.user?.role !== USER_ROLES.SUPERADMIN && data.clientStatus && !data.canCreateRequisitions}
		<div
			class="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900"
		>
			{#if data.billingBlockedMessage && data.clientStatus === 'ACTIVE'}
				<!-- Account is approved but can't be invoiced yet — billing must be
				     set up before any requisition can be posted. -->
				<strong>Billing setup required.</strong>
				{data.billingBlockedMessage}
				<a href="/settings?tab=BILLING&role=CLIENT" class="underline font-medium ml-1"
					>Go to billing settings</a
				>
			{:else if data.clientStatus === 'PENDING'}
				Your account is <strong>pending approval</strong>. You'll be able to create new
				requisitions once an admin approves you.
			{:else if data.clientStatus === 'DENIED'}
				Your account has been <strong>denied</strong>. Please contact support if you believe this
				is a mistake.
			{:else}
				Your account is <strong>inactive</strong>. Requisition posting is paused. Contact support
				to reactivate.
			{/if}
		</div>
	{/if}

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search requisitions..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-primary hover:bg-primary/90"
			on:click={() => handleSearch(searchTerm)}>Search</Button
		>
	</form>

	{#if data.filter === 'unbilled'}
		<div
			class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
		>
			<span>
				Showing <strong>{requisitions.length}</strong> unbilled permanent placement{requisitions.length ===
				1
					? ''
					: 's'} — filled, but no live invoice raised yet.
			</span>
			<Button variant="link" class="h-auto p-0 text-amber-900 underline" on:click={clearFilter}>
				Clear filter
			</Button>
		</div>
	{/if}

	<!-- Tabs with Tables -->
	<Tabs.Root bind:value={activeTab} class="">
		<Tabs.List
			class="grid w-full h-auto"
			style={`grid-template-columns: repeat(${visibleTabs.length}, minmax(0, 1fr));`}
		>
			{#each visibleTabs as tab}
				<Tabs.Trigger value={tab.value} class="relative">
					{tab.label}
					{#if tabCounts[tab.value] > 0}
						<Badge
							variant={tab.value === 'open' || tab.value === 'payment-required'
								? 'destructive'
								: 'secondary'}
							class="ml-2 h-5 min-w-5 text-xs"
							value={tabCounts[tab.value]}
						></Badge>
					{/if}
				</Tabs.Trigger>
			{/each}
		</Tabs.List>

		<!-- Tab Contents -->
		{#each visibleTabs.map((t) => t.value) as tabValue}
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
									No {activeTabLabel} requisitions found
								</h3>
								<p class="text-sm text-gray-500">
									{#if searchTerm}
										Try adjusting your search terms
									{:else}
										No {activeTabLabel} requisitions available
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
