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
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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
		History,
		Eye,
		Calendar,
		X
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';

	export let data: PageData;

	type HistoryData = {
		id: string;
		createdAt: Date;
		updatedAt: Date;
		entityId: string;
		entityType: string;
		userId: string;
		action: string;
		changes: {
			before?: Record<string, any>;
			after?: Record<string, any>;
		} | null;
		metadata: Record<string, any> | null;
		userFirstName: string | null;
		userLastName: string | null;
		userEmail: string | null;
	};

	let tableData: HistoryData[] = [];
	let searchTerm = '';
	let startDate = '';
	let endDate = '';
	let selectedRecord: HistoryData | null = null;
	let detailsDialogOpen = false;

	$: history = (data.history as HistoryData[]) || [];

	// Helper function to get action badge color
	function getActionBadgeClass(action: string) {
		switch (action.toUpperCase()) {
			case 'CREATE':
				return 'bg-green-100 text-green-800 hover:bg-green-100';
			case 'UPDATE':
				return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
			case 'DELETE':
				return 'bg-red-100 text-red-800 hover:bg-red-100';
			default:
				return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
		}
	}

	// Helper function to format entity type
	function formatEntityType(entityType: string): string {
		return entityType
			.split('_')
			.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
			.join(' ');
	}

	// Helper function to get key changes summary
	function getChangesSummary(changes: HistoryData['changes']): string {
		if (!changes) return 'No changes recorded';

		const { before, after } = changes;

		if (!before && after) {
			// CREATE action
			return 'Record created';
		}

		if (before && after) {
			// UPDATE action - find what changed
			const changedFields: string[] = [];
			const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

			allKeys.forEach((key) => {
				if (key === 'updatedAt' || key === 'createdAt') return; // Skip timestamp fields
				if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
					changedFields.push(key);
				}
			});

			if (changedFields.length === 0) return 'No changes detected';
			if (changedFields.length === 1) return `${changedFields[0]} changed`;
			return `${changedFields.length} fields changed`;
		}

		if (before && !after) {
			// DELETE action
			return 'Record deleted';
		}

		return 'No changes recorded';
	}

	// Column definitions
	const columns: ColumnDef<HistoryData>[] = [
		{
			header: 'Timestamp',
			id: 'createdAt',
			accessorKey: 'createdAt',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const dateA = new Date(rowA.original.createdAt).getTime();
				const dateB = new Date(rowB.original.createdAt).getTime();
				return dateA - dateB;
			},
			cell: ({ getValue }) => {
				const date = getValue() as Date;
				return new Date(date).toLocaleString();
			}
		},
		{
			header: 'User',
			id: 'user',
			accessorFn: (row) =>
				row.userFirstName && row.userLastName
					? `${row.userLastName}, ${row.userFirstName}`
					: row.userEmail || 'Unknown User',
			enableSorting: true,
			sortingFn: (rowA, rowB) => {
				const nameA =
					rowA.original.userLastName?.toLowerCase() ||
					rowA.original.userFirstName?.toLowerCase() ||
					rowA.original.userEmail?.toLowerCase() ||
					'';
				const nameB =
					rowB.original.userLastName?.toLowerCase() ||
					rowB.original.userFirstName?.toLowerCase() ||
					rowB.original.userEmail?.toLowerCase() ||
					'';
				return nameA.localeCompare(nameB);
			}
		},
		{
			header: 'Action',
			id: 'action',
			accessorKey: 'action',
			enableSorting: true,
			cell: ({ getValue }) => {
				const action = getValue() as string;
				return flexRender(Badge, {
					value: action,
					class: getActionBadgeClass(action)
				});
			}
		},
		{
			header: 'Entity Type',
			id: 'entityType',
			accessorKey: 'entityType',
			enableSorting: true,
			cell: ({ getValue }) => {
				const entityType = getValue() as string;
				return formatEntityType(entityType);
			}
		},
		{
			header: 'Entity ID',
			id: 'entityId',
			accessorKey: 'entityId',
			enableSorting: true,
			cell: ({ getValue }) => {
				const id = getValue() as string;
				// Truncate long IDs
				return id.length > 20 ? `${id.substring(0, 20)}...` : id;
			}
		},
		{
			header: 'Changes',
			id: 'changes',
			accessorKey: 'changes',
			enableSorting: false,
			cell: ({ row }) => {
				return getChangesSummary(row.original.changes);
			}
		}
	];

	// Table options
	const options = writable<TableOptions<HistoryData>>({
		data: tableData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 15
			}
		}
	});

	// Update table data when history changes
	$: {
		tableData = history;
		options.update((o) => ({ ...o, data: tableData }));
	}

	onMount(() => {
		tableData = history;
		options.update((o) => ({ ...o, data: tableData }));
	});

	const table = createSvelteTable(options);

	function getSortingIcon(header: any) {
		if (!header.column.getCanSort()) return null;

		const sorted = header.column.getIsSorted();
		if (sorted === 'asc') return ArrowUp;
		if (sorted === 'desc') return ArrowDown;
		return ArrowUpDown;
	}

	function handleSearch() {
		const params = new URLSearchParams();
		if (searchTerm) params.set('search', searchTerm);
		if (startDate) params.set('startDate', startDate);
		if (endDate) params.set('endDate', endDate);

		const queryString = params.toString();
		goto(queryString ? `/admin/menu/record-history?${queryString}` : '/admin/menu/record-history');
	}

	function clearFilters() {
		searchTerm = '';
		startDate = '';
		endDate = '';
		goto('/admin/menu/record-history');
	}

	function viewDetails(record: HistoryData) {
		selectedRecord = record;
		detailsDialogOpen = true;
	}

	function formatJSON(obj: any): string {
		return JSON.stringify(obj, null, 2);
	}
</script>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Record History</h1>
			<p class="text-muted-foreground">Audit log of all system actions</p>
		</div>
	</div>

	<!-- Search and Filters -->
	<div class="bg-white rounded-lg shadow-sm p-4 space-y-4">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Search Input -->
			<div class="md:col-span-3 lg:col-span-1">
				<Label for="search">Search</Label>
				<Input
					id="search"
					bind:value={searchTerm}
					placeholder="User, entity type, ID..."
					class="bg-white"
					on:keypress={(e) => e.key === 'Enter' && handleSearch()}
				/>
			</div>

			<!-- Start Date -->
			<div>
				<Label for="startDate">Start Date</Label>
				<div class="relative">
					<Input
						id="startDate"
						type="date"
						bind:value={startDate}
						class="bg-white"
						on:change={handleSearch}
					/>
					<Calendar class="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
				</div>
			</div>

			<!-- End Date -->
			<div>
				<Label for="endDate">End Date</Label>
				<div class="relative">
					<Input
						id="endDate"
						type="date"
						bind:value={endDate}
						class="bg-white"
						on:change={handleSearch}
					/>
					<Calendar class="absolute right-3 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
				</div>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<Button size="sm" class="bg-primary hover:bg-primary/90" on:click={handleSearch}>
				<Search class="h-4 w-4 mr-2" />
				Search
			</Button>
			{#if searchTerm || startDate || endDate}
				<Button size="sm" variant="outline" on:click={clearFilters}>
					<X class="h-4 w-4 mr-2" />
					Clear Filters
				</Button>
			{/if}
		</div>
	</div>

	<!-- Table -->
	<div class="bg-white rounded-lg shadow-sm flex-1 flex flex-col">
		{#if $table.getRowModel().rows.length > 0}
			<div class="rounded-md border flex-1 overflow-auto">
				<Table.Root>
					<Table.Header>
						{#each $table.getHeaderGroups() as headerGroup}
							<Table.Row class="bg-white">
								{#each headerGroup.headers as header}
									<Table.Head>
										{#if header.column.columnDef.header}
											<Button
												variant="ghost"
												on:click={() =>
													header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
												class="hover:bg-gray-50"
												disabled={!header.column.getCanSort()}
											>
												{header.column.columnDef.header}
												{#if header.column.getCanSort()}
													{#if getSortingIcon(header)}
														<svelte:component this={getSortingIcon(header)} class="ml-2 h-4 w-4" />
													{/if}
												{/if}
											</Button>
										{/if}
									</Table.Head>
								{/each}
								<Table.Head>Actions</Table.Head>
							</Table.Row>
						{/each}
					</Table.Header>
					<Table.Body>
						{#each $table.getRowModel().rows as row}
							<Table.Row class="bg-gray-50 hover:bg-gray-100 transition-colors">
								{#each row.getVisibleCells() as cell}
									<Table.Cell>
										<svelte:component
											this={flexRender(cell.column.columnDef.cell, cell.getContext())}
										/>
									</Table.Cell>
								{/each}
								<Table.Cell>
									<Button
										type="button"
										variant="outline"
										size="sm"
										on:click={() => viewDetails(row.original)}
										title="View Details"
									>
										<Eye size={16} />
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<!-- Pagination -->
			<div class="flex items-center justify-between space-x-2 p-4 border-t">
				<div class="flex-1 text-sm text-muted-foreground">
					Showing {$table.getState().pagination.pageIndex * $table.getState().pagination.pageSize +
						1} to {Math.min(
						($table.getState().pagination.pageIndex + 1) * $table.getState().pagination.pageSize,
						$table.getRowModel().rows.length
					)} of {$table.getRowModel().rows.length} records
				</div>
				<div class="flex items-center space-x-2">
					<Button
						variant="outline"
						size="sm"
						on:click={() => $table.previousPage()}
						disabled={!$table.getCanPreviousPage()}
					>
						<ChevronLeft class="h-4 w-4" />
						Previous
					</Button>
					<div class="flex items-center space-x-1">
						<span class="text-sm text-muted-foreground">
							Page {$table.getState().pagination.pageIndex + 1} of {$table.getPageCount()}
						</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						on:click={() => $table.nextPage()}
						disabled={!$table.getCanNextPage()}
					>
						Next
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{:else}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center py-12 text-center flex-1">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<History class="w-8 h-8 text-gray-400" />
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No history records found</h3>
				<p class="text-sm text-gray-500">
					{#if searchTerm || startDate || endDate}
						Try adjusting your search or date filters
					{:else}
						No actions have been recorded yet
					{/if}
				</p>
			</div>
		{/if}
	</div>
</section>

<!-- Details Dialog -->
<Dialog.Root bind:open={detailsDialogOpen}>
	<Dialog.Content class="max-w-3xl max-h-[80vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Record History Details</Dialog.Title>
			<Dialog.Description>
				Detailed view of the action and changes made
			</Dialog.Description>
		</Dialog.Header>
		{#if selectedRecord}
			<div class="space-y-4">
				<!-- Basic Info -->
				<div class="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
					<div>
						<p class="text-sm font-medium text-gray-500">Timestamp</p>
						<p class="text-sm">{new Date(selectedRecord.createdAt).toLocaleString()}</p>
					</div>
					<div>
						<p class="text-sm font-medium text-gray-500">User</p>
						<p class="text-sm">
							{selectedRecord.userFirstName && selectedRecord.userLastName
								? `${selectedRecord.userLastName}, ${selectedRecord.userFirstName}`
								: selectedRecord.userEmail || 'Unknown User'}
						</p>
					</div>
					<div>
						<p class="text-sm font-medium text-gray-500">Action</p>
						<Badge class={getActionBadgeClass(selectedRecord.action)} value={selectedRecord.action} />
					</div>
					<div>
						<p class="text-sm font-medium text-gray-500">Entity Type</p>
						<p class="text-sm">{formatEntityType(selectedRecord.entityType)}</p>
					</div>
					<div class="col-span-2">
						<p class="text-sm font-medium text-gray-500">Entity ID</p>
						<p class="text-sm font-mono break-all">{selectedRecord.entityId}</p>
					</div>
				</div>

				<!-- Changes -->
				{#if selectedRecord.changes}
					<div class="space-y-4">
						{#if selectedRecord.changes.before}
							<div>
								<h4 class="text-sm font-semibold mb-2">Before</h4>
								<pre
									class="text-xs bg-gray-50 p-4 rounded-lg overflow-auto max-h-60 border whitespace-pre-wrap break-words">{formatJSON(
										selectedRecord.changes.before
									)}</pre>
							</div>
						{/if}
						{#if selectedRecord.changes.after}
							<div>
								<h4 class="text-sm font-semibold mb-2">After</h4>
								<pre
									class="text-xs bg-gray-50 p-4 rounded-lg overflow-auto max-h-60 border whitespace-pre-wrap break-words">{formatJSON(
										selectedRecord.changes.after
									)}</pre>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-gray-500">No changes recorded</p>
				{/if}

				<!-- Metadata -->
				{#if selectedRecord.metadata && Object.keys(selectedRecord.metadata).length > 0}
					<div>
						<h4 class="text-sm font-semibold mb-2">Metadata</h4>
						<pre
							class="text-xs bg-gray-50 p-4 rounded-lg overflow-auto max-h-40 border whitespace-pre-wrap break-words">{formatJSON(
								selectedRecord.metadata
							)}</pre>
					</div>
				{/if}
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (detailsDialogOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
