<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		type ColumnDef,
		getCoreRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		createSvelteTable
	} from '$lib/components/tables/svelte-table';
	import * as Table from '$lib/components/ui/table';
	import { ArrowUpDown } from 'lucide-svelte';
	import type { InvoiceWithRelations } from '$lib/server/database/schemas/requisition';
	import DataTableActions from './data-table-actions.svelte';
	import { writable } from 'svelte/store';
	import { USER_ROLES } from '$lib/config/constants';

	export let data: InvoiceWithRelations[];
	export let role;

	$: isAdmin = role === USER_ROLES.SUPERADMIN;

	// Define columns
	const columns: ColumnDef<InvoiceWithRelations>[] = [
		{
			header: 'Invoice #',
			accessorFn: (row) => row.invoice.invoiceNumber
		},
		{
			header: 'Req #',
			accessorFn: (row) => row.requisition?.id
		},
		{
			header: isAdmin ? 'Client' : 'Candidate',
			accessorFn: (row) =>
				isAdmin
					? `${row.company?.companyName}`
					: `${row.candidate?.user.firstName} ${row.candidate?.user.lastName}`
		},
		{
			header: 'Status',
			accessorFn: (row) => row.invoice.status,
			cell: ({ getValue }) => getValue()
		},
		{
			header: 'Amount',
			accessorFn: (row) => row.invoice.total,
			cell: ({ getValue }) => {
				const amount = Number(getValue());
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD'
				}).format(amount);
			}
		},
		{
			header: 'Due Date',
			accessorFn: (row) => row.invoice.dueDate,
			cell: ({ getValue }) =>
				getValue() ? new Date(getValue() as string).toLocaleDateString() : '-'
		},
		{
			id: 'actions',
			header: '',
			cell: ({ row }) => ({
				component: DataTableActions,
				props: { row: row.original }
			})
		}
	];

	// Create table options
	const tableOptions = writable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		initialState: {
			pagination: {
				pageSize: 10, // Set your desired page size
				pageIndex: 0
			}
		}
	});

	// Create table
	const table = createSvelteTable(tableOptions);

	$: tableOptions.update((opts) => ({ ...opts, data }));
</script>

<div>
	<div class="rounded-md border bg-white">
		<Table.Root>
			<Table.Header>
				{#each $table.getHeaderGroups() as headerGroup}
					<Table.Row>
						{#each headerGroup.headers as header}
							<Table.Head>
								{#if header.column.columnDef.header}
									<Button
										variant="ghost"
										on:click={() =>
											header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
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
				{#each $table.getRowModel().rows as row}
					<Table.Row>
						{#each row.getVisibleCells() as cell}
							<Table.Cell>
								{#if cell.column.columnDef.cell && typeof cell.column.columnDef.cell === 'function'}
									{#if cell.column.columnDef.id === 'actions'}
										<svelte:component this={DataTableActions} row={row.original} />
									{:else}
										{cell.column.columnDef.cell(cell.getContext())}
									{/if}
								{:else}
									{cell.getValue()}
								{/if}
							</Table.Cell>
						{/each}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<!-- Client-side pagination controls -->
	<div class="flex items-center justify-between space-x-2 py-4">
		<div class="text-sm text-muted-foreground">
			Showing {$table.getState().pagination.pageIndex * $table.getState().pagination.pageSize + 1} to
			{Math.min(
				($table.getState().pagination.pageIndex + 1) * $table.getState().pagination.pageSize,
				data.length
			)} of {data.length} results
		</div>
		<div class="flex items-center space-x-2">
			<Button
				variant="outline"
				size="sm"
				on:click={() => $table.previousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				Previous
			</Button>
			<Button
				variant="outline"
				size="sm"
				on:click={() => $table.nextPage()}
				disabled={!$table.getCanNextPage()}
			>
				Next
			</Button>
		</div>
	</div>
</div>
