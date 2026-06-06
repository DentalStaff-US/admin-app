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
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';
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
		FileText,
		Eye,
		AlertTriangle,
		MoreHorizontal,
		Clock,
		Ban
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import { USER_ROLES } from '$lib/config/constants';
	import type { InvoiceWithRelations } from '$lib/server/database/schemas/requisition';

	export let data: PageData;

	let searchTerm = data.searchTerm || '';
	let activeTab = 'all';

	$: user = data.user;
	$: invoices = (data.invoices as InvoiceWithRelations[]) || [];
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;

	// Helper function to check if invoice is overdue
	function isOverdue(invoice: InvoiceWithRelations): boolean {
		if (!invoice.invoice.dueDate || invoice.invoice.status === 'paid' || invoice.invoice.status === 'void') {
			return false;
		}
		const dueDate = new Date(invoice.invoice.dueDate);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return dueDate < today;
	}

	// Filter invoices by status. Voided invoices are segregated into their own
	// tab, so every other tab (incl. "all") excludes them.
	const filterByStatus = (invoices: InvoiceWithRelations[], status: string) => {
		switch (status) {
			case 'open':
				return invoices.filter((inv) => inv.invoice.status === 'open');
			case 'paid':
				return invoices.filter((inv) => inv.invoice.status === 'paid');
			case 'overdue':
				return invoices.filter((inv) => isOverdue(inv));
			case 'voided':
				return invoices.filter((inv) => inv.invoice.status === 'void');
			default:
				return invoices.filter((inv) => inv.invoice.status !== 'void');
		}
	};

	// Column definitions
	const columns: ColumnDef<InvoiceWithRelations>[] = [
		{
			header: 'Invoice #',
			id: 'invoiceNumber',
			accessorKey: 'invoice.invoiceNumber',
			enableSorting: true
		},
		{
			header: 'Req #',
			id: 'requisitionId',
			accessorFn: (row) => row.requisition?.id || 'N/A',
			enableSorting: true
		},
		{
			header: isAdmin ? 'Client' : 'Candidate',
			id: 'clientOrCandidate',
			accessorFn: (row) =>
				isAdmin
					? row.company?.companyName || 'N/A'
					: `${row.candidate?.user.firstName || ''} ${row.candidate?.user.lastName || ''}`.trim() ||
						'N/A',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA = isAdmin
					? rowA.original.company?.companyName?.toLowerCase() || ''
					: `${rowA.original.candidate?.user.firstName || ''} ${rowA.original.candidate?.user.lastName || ''}`.toLowerCase();
				const nameB = isAdmin
					? rowB.original.company?.companyName?.toLowerCase() || ''
					: `${rowB.original.candidate?.user.firstName || ''} ${rowB.original.candidate?.user.lastName || ''}`.toLowerCase();
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Status',
			id: 'status',
			accessorKey: 'invoice.status',
			enableSorting: true,
			cell: ({ getValue }) => {
				const status = getValue() as string;
				return flexRender(StatusBadge, {
					status,
					label: status.toUpperCase()
				});
			}
		},
		{
			header: 'Amount',
			id: 'amount',
			accessorKey: 'invoice.total',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const amountA = Number(rowA.original.invoice.total) || 0;
				const amountB = Number(rowB.original.invoice.total) || 0;
				return amountA - amountB;
			},
			cell: ({ getValue }) => {
				const amount = Number(getValue()) || 0;
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD'
				}).format(amount);
			}
		},
		{
			header: 'Due Date',
			id: 'dueDate',
			accessorKey: 'invoice.dueDate',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const dateA = rowA.original.invoice.dueDate
					? new Date(rowA.original.invoice.dueDate).getTime()
					: 0;
				const dateB = rowB.original.invoice.dueDate
					? new Date(rowB.original.invoice.dueDate).getTime()
					: 0;
				return dateA - dateB;
			},
			cell: ({ getValue }) => {
				const dueDate = getValue() as string;
				if (!dueDate) return 'N/A';
				const date = new Date(dueDate);
				return new Intl.DateTimeFormat('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				}).format(date);
			}
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false
		}
	];

	// Create separate table instances for each tab
	const createTableOptions = (
		data: InvoiceWithRelations[]
	): TableOptions<InvoiceWithRelations> => ({
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
	const allOptions = writable<TableOptions<InvoiceWithRelations>>(createTableOptions([]));
	const openOptions = writable<TableOptions<InvoiceWithRelations>>(createTableOptions([]));
	const paidOptions = writable<TableOptions<InvoiceWithRelations>>(createTableOptions([]));
	const overdueOptions = writable<TableOptions<InvoiceWithRelations>>(createTableOptions([]));
	const voidedOptions = writable<TableOptions<InvoiceWithRelations>>(createTableOptions([]));

	// Create table instances
	const allTable = createSvelteTable(allOptions);
	const openTable = createSvelteTable(openOptions);
	const paidTable = createSvelteTable(paidOptions);
	const overdueTable = createSvelteTable(overdueOptions);
	const voidedTable = createSvelteTable(voidedOptions);

	// Get current active table
	$: currentTable =
		activeTab === 'all'
			? allTable
			: activeTab === 'open'
				? openTable
				: activeTab === 'paid'
					? paidTable
					: activeTab === 'voided'
						? voidedTable
						: overdueTable;

	// Update table data when invoices change
	$: {
		const allData = filterByStatus(invoices, 'all');
		const openData = filterByStatus(invoices, 'open');
		const paidData = filterByStatus(invoices, 'paid');
		const overdueData = filterByStatus(invoices, 'overdue');
		const voidedData = filterByStatus(invoices, 'voided');

		allOptions.update((opts) => ({ ...opts, data: allData, columns }));
		openOptions.update((opts) => ({ ...opts, data: openData, columns }));
		paidOptions.update((opts) => ({ ...opts, data: paidData, columns }));
		overdueOptions.update((opts) => ({ ...opts, data: overdueData, columns }));
		voidedOptions.update((opts) => ({ ...opts, data: voidedData, columns }));
	}

	onMount(() => {
		const allData = filterByStatus(invoices, 'all');
		const openData = filterByStatus(invoices, 'open');
		const paidData = filterByStatus(invoices, 'paid');
		const overdueData = filterByStatus(invoices, 'overdue');
		const voidedData = filterByStatus(invoices, 'voided');

		allOptions.update((opts) => ({ ...opts, data: allData, columns }));
		openOptions.update((opts) => ({ ...opts, data: openData, columns }));
		paidOptions.update((opts) => ({ ...opts, data: paidData, columns }));
		overdueOptions.update((opts) => ({ ...opts, data: overdueData, columns }));
		voidedOptions.update((opts) => ({ ...opts, data: voidedData, columns }));
	});

	// Get tab counts
	$: tabCounts = {
		all: filterByStatus(invoices, 'all').length,
		open: filterByStatus(invoices, 'open').length,
		paid: filterByStatus(invoices, 'paid').length,
		overdue: filterByStatus(invoices, 'overdue').length,
		voided: filterByStatus(invoices, 'voided').length
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
			goto('/invoices');
		} else {
			goto(`/invoices?search=${encodeURIComponent(searchTerm.trim())}`);
		}
	}

	function handleRowClick(invoiceId: string) {
		goto(`/invoices/${invoiceId}`);
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch(searchTerm);
		}
	}
</script>

<svelte:head>
	<title>Invoices | DTSS</title>
</svelte:head>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6 flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Invoices</h1>
			<p class="text-muted-foreground">Track and manage invoice payments</p>
		</div>
	</div>

	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search invoices..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-blue-800 hover:bg-blue-900"
			on:click={() => handleSearch(searchTerm)}
		>
			Search
		</Button>
	</form>

	{#if invoices.length === 0}
		<!-- Empty State -->
		<Card.Root class="w-full flex flex-col items-center p-12 border-dashed">
			<div class="flex flex-col items-center gap-4 text-center">
				<div class="rounded-full bg-muted p-4">
					<FileText class="h-8 w-8 text-muted-foreground" />
				</div>
				<Card.Title class="text-2xl">No invoices yet</Card.Title>
				<Card.Description class="max-w-[420px] text-center text-muted-foreground">
					{#if searchTerm}
						No invoices found matching your search terms. Try adjusting your search.
					{:else}
						No invoices have been created yet. When timesheets are submitted for requisitions,
						invoices will be auto generated and will appear here.
					{/if}
				</Card.Description>
			</div>
		</Card.Root>
	{:else}
		<!-- Tabs with Tables -->
		<Tabs.Root bind:value={activeTab} class="">
			<Tabs.List class="grid w-full grid-cols-5">
				<Tabs.Trigger value="all" class="relative">
					All Invoices
					{#if tabCounts.all > 0}
						<Badge variant="secondary" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.all}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="open" class="relative">
					Open
					{#if tabCounts.open > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs bg-blue-100 text-blue-800"
							value={tabCounts.open}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="paid" class="relative">
					Paid
					{#if tabCounts.paid > 0}
						<Badge
							variant="secondary"
							class="ml-2 h-5 min-w-5 text-xs bg-green-100 text-green-800"
							value={tabCounts.paid}
						></Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="overdue" class="relative">
					<Clock class="h-4 w-4 mr-1" />
					Overdue
					{#if tabCounts.overdue > 0}
						<Badge variant="destructive" class="ml-2 h-5 min-w-5 text-xs" value={tabCounts.overdue}
						></Badge>
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
			{#each ['all', 'open', 'paid', 'overdue', 'voided'] as tabValue}
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
													on:click={() => handleRowClick(row.original.invoice.id)}
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
										)} of {$currentTable.getRowModel().rows.length} invoices
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
										{#if activeTab === 'overdue'}
											<Clock class="w-8 h-8 text-gray-400" />
										{:else if activeTab === 'paid'}
											<FileText class="w-8 h-8 text-green-500" />
										{:else if activeTab === 'open'}
											<FileText class="w-8 h-8 text-blue-500" />
										{:else}
											<FileText class="w-8 h-8 text-gray-400" />
										{/if}
									</div>
									<h3 class="text-lg font-medium text-gray-900 mb-2">
										No {activeTab === 'all'
											? 'invoices'
											: activeTab === 'overdue'
												? 'overdue invoices'
												: `${activeTab} invoices`} found
									</h3>
									<p class="text-sm text-gray-500">
										{#if searchTerm}
											Try adjusting your search terms
										{:else if activeTab === 'overdue'}
											Great! No overdue invoices at the moment.
										{:else if activeTab === 'paid'}
											No paid invoices yet.
										{:else if activeTab === 'open'}
											No open invoices at the moment.
										{:else}
											No invoices in this category yet.
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
