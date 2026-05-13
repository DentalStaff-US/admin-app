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
	import type { PageData } from './$types';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { newSupportTicketSchema, type NewSupportTicketSchema } from '$lib/config/zod-schemas';
	import { USER_ROLES } from '$lib/config/constants';
	import type { SupportTicketResult } from '$lib/server/database/queries/support';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import ViewLink from '$lib/components/tables/ViewLink.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import * as Table from '$lib/components/ui/table';
	import { format } from 'date-fns';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import NewSupportTicketDialog from '$lib/components/dialogs/newSupportTicketDialog.svelte';
	import { goto } from '$app/navigation';
	import { Input } from '$lib/components/ui/input';
	import { Search } from 'flowbite-svelte';

	export let data: PageData;
	export let form: SuperValidated<NewSupportTicketSchema>;
	let open = false;

	// Reactive declarations
	$: tickets = data.tickets as SupportTicketResult[];
	$: user = data.user;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;
	$: isClient = user?.role === USER_ROLES.CLIENT || user?.role === USER_ROLES.CLIENT_STAFF;
	$: searchTerm = '';

	const handleSearch = (term: string) => {
		if (!term || term.trim() === '') {
			// If the search term is empty, redirect to the support page without search
			goto('/support', { replaceState: true });
			return;
		}
		goto(`/support?search=${encodeURIComponent(term)}`, {
			replaceState: true
		});
	};

	form = data.form;

	let tableData: SupportTicketResult[] = [];

	// Common columns
	const baseColumns: ColumnDef<SupportTicketResult>[] = [
		{
			header: '',
			id: 'id',
			accessorFn: (original) => original.supportTicket.id,
			cell: (original) =>
				flexRender(ViewLink, {
					href: `/support/ticket/${original.getValue()}`
				})
		},
		{
			header: 'Title',
			id: 'title',
			accessorFn: (original) => original.supportTicket.title
		}
	];

	// Client-specific columns
	const clientColumns: ColumnDef<SupportTicketResult>[] = [
		...baseColumns,
		{
			header: 'Date Created',
			id: 'createdAt',
			accessorFn: (original) => original.supportTicket.createdAt,
			cell: (original) => format(original.getValue() as Date, 'PPp')
		},
		{
			header: 'Last Updated',
			id: 'updatedAt',
			accessorFn: (original) => original.supportTicket.updatedAt,
			cell: (original) => format(original.getValue() as Date, 'PPp')
		},
		{
			header: 'Status',
			id: 'status',
			accessorFn: (original) => original.supportTicket.status,
			cell: (original) =>
				flexRender(StatusBadge, { status: original.getValue() as string })
		}
	];

	// Admin-specific columns
	const adminColumns: ColumnDef<SupportTicketResult>[] = [
		...baseColumns,
		{
			header: 'Opened By',
			id: 'reportedBy',
			accessorFn: (original) =>
				original.reportedBy
					? `${original.reportedBy.firstName || ''} ${original.reportedBy.lastName || ''}`.trim()
					: 'Unknown'
		},
		{
			header: 'Role',
			id: 'reporterRole',
			accessorFn: (original) => original.reportedBy?.role ?? '',
			cell: (original) =>
				flexRender(Badge, {
					variant: 'outline',
					value: ((original.getValue() as string) || '').replace('_', ' ')
				})
		},
		{
			header: 'Date Created',
			id: 'createdAt',
			accessorFn: (original) => original.supportTicket.createdAt,
			cell: (original) => format(original.getValue() as Date, 'PP')
		},
		{
			header: 'Status',
			id: 'status',
			accessorFn: (original) => original.supportTicket.status,
			cell: (original) =>
				flexRender(StatusBadge, { status: original.getValue() as string })
		}
	];

	// Table options
	const options = writable<TableOptions<SupportTicketResult>>({
		data: tableData,
		columns: isAdmin ? adminColumns : clientColumns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: {
				pageSize: 10
			}
		}
	});

	// Update table data and columns when user role or tickets change
	$: {
		tableData = tickets || [];
		options.update((o) => ({
			...o,
			data: tableData,
			columns: isAdmin ? adminColumns : clientColumns
		}));
	}

	onMount(() => {
		tableData = tickets || [];
		options.update((o) => ({
			...o,
			data: tableData,
			columns: isAdmin ? adminColumns : clientColumns
		}));
	});

	const table = createSvelteTable(options);
</script>

<section class="grow h-screen overflow-y-auto p-6 flex flex-col gap-6">
	<div class="flex items-center justify-between flex-wrap">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">Support</h1>
		<NewSupportTicketDialog bind:open {user} bind:form />
	</div>
	<!-- Search -->
	<form on:submit|preventDefault={() => handleSearch(searchTerm)} class="flex items-center gap-2">
		<Input bind:value={searchTerm} placeholder="Search tickets..." class="bg-white max-w-xs" />
		<Button
			size="sm"
			class="bg-blue-800 hover:bg-blue-900"
			on:click={() => handleSearch(searchTerm)}>Search</Button
		>
	</form>

	<div class="bg-white rounded-lg shadow-sm">
		{#if tableData && tableData.length > 0}
			<div class="rounded-md border">
				<Table.Root>
					<Table.TableHeader>
						{#each $table.getHeaderGroups() as headerGroup}
							<Table.TableRow class="bg-white">
								{#each headerGroup.headers as header}
									<Table.TableHead
										class="hover:bg-white cursor-pointer relative"
										colspan={header.colSpan}
									>
										<svelte:component
											this={flexRender(header.column.columnDef.header, header.getContext())}
										/>
									</Table.TableHead>
								{/each}
							</Table.TableRow>
						{/each}
					</Table.TableHeader>
					<Table.TableBody>
						{#each $table.getRowModel().rows as row}
							<Table.TableRow class="bg-gray-50 hover:bg-gray-100">
								{#each row.getVisibleCells() as cell}
									<Table.TableCell>
										<svelte:component
											this={flexRender(cell.column.columnDef.cell, cell.getContext())}
										/>
									</Table.TableCell>
								{/each}
							</Table.TableRow>
						{/each}
					</Table.TableBody>
				</Table.Root>
			</div>

			<!-- Pagination Controls -->
			<div class="flex items-center justify-between space-x-2 p-4 border-t">
				<div class="flex-1 text-sm text-muted-foreground">
					Showing {$table.getState().pagination.pageIndex * $table.getState().pagination.pageSize +
						1} to {Math.min(
						($table.getState().pagination.pageIndex + 1) * $table.getState().pagination.pageSize,
						$table.getFilteredRowModel().rows.length
					)} of {$table.getFilteredRowModel().rows.length} tickets
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
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
					<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
						/>
					</svg>
				</div>
				<h3 class="text-lg font-medium text-gray-900 mb-2">No Support Tickets</h3>
				<p class="text-sm text-gray-500 mb-6 max-w-sm">
					{#if isAdmin}
						No support tickets have been created yet.
					{:else}
						You haven't created any support tickets yet. Click the button above to create your first
						ticket.
					{/if}
				</p>
				{#if isClient}
					<NewSupportTicketDialog bind:open {user} bind:form>
						<Button variant="outline" class="gap-2">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 6v6m0 0v6m0-6h6m-6 0H6"
								/>
							</svg>
							Create First Ticket
						</Button>
					</NewSupportTicketDialog>
				{/if}
			</div>
		{/if}
	</div>
</section>
