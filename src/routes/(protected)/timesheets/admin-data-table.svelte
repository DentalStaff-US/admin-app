<script lang="ts">
    import { Button } from '$lib/components/ui/button';
    import {
      type ColumnDef,
      getCoreRowModel,
      getPaginationRowModel,
      getSortedRowModel,
      createSvelteTable,
  	flexRender,
    } from '@tanstack/svelte-table';
    import * as Table from '$lib/components/ui/table';
    import { ArrowUpDown } from 'lucide-svelte';
    import type { TimesheetWithRelations } from '$lib/server/database/schemas/requisition';
    import DataTableActions from './data-table-actions.svelte';
    import ViewLink from '$lib/components/tables/ViewLink.svelte';
    import { writable } from 'svelte/store';
    import { Badge } from '$lib/components/ui/badge';
    import { cn } from '$lib/utils';

  export let data: TimesheetWithRelations[];

  const columns: ColumnDef<TimesheetWithRelations>[] = [
  		{
			header: '',
			id: 'id',
			accessorFn: (original) => original.timesheet.id,
			cell: (original) =>
				flexRender(ViewLink, {
					href: `/timesheets/${original.getValue()}`
				})
		},
    {
      header: "Requisition",
      accessorFn: (row) => row.requisition?.title
    },
    {
      header: "Candidate",
      accessorFn: row => `${row.candidate.firstName} ${row.candidate.lastName}`,
    },
    {
        header: 'Status',
        id: 'status',
        accessorFn: (original) => original.timesheet.status,
        cell: ({getValue}) => flexRender(
          Badge,
          {
            class: cn(
              getValue() === 'PENDING' && 'bg-yellow-300 hover:bg-yellow-400',
            getValue() === 'DISCREPANCY' && 'bg-orange-400 hover:bg-bg-orange-500',
            getValue() === 'APPROVED' && 'bg-green-400 hover:bg-success/90',
            getValue() === 'VOID' && 'bg-gray-200 hover:bg-gray-300',
            getValue() === 'REJECTED' && 'bg-destructive hover:bg-destructive/90'
            ),
            value: getValue()
          }
        )
    },
    {
      header: "Hours Worked",
      accessorFn: row => row.timesheet.totalHoursWorked,
      cell: ({ getValue }) => {
        return (Number(getValue()) || 0).toFixed(2);
      }
    },
    {
      header: "Work Week",
      accessorFn: row => row.timesheet.weekBeginDate,
      cell: ({ getValue }) => getValue() ? new Date(getValue() as string).toLocaleDateString() : '-'
    },
    {
      id: 'actions',
      header: "",
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
    state: {
      pagination: {
        pageSize: 10,
        pageIndex: 0
      }
    }
  });

  // Create table
  const table = createSvelteTable(tableOptions);
</script>

<div>
  <div class="rounded-md border">
    <Table.Root class="bg-white rounded-md">
      <Table.Header>
        {#each $table.getHeaderGroups() as headerGroup}
          <Table.Row>
            {#each headerGroup.headers as header}
              <Table.Head>
                {#if header.column.columnDef.header}
                  <Button
                    variant="ghost"
                    on:click={() => header.column.toggleSorting(header.column.getIsSorted() === "asc")}
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
                  <svelte:component
										this={flexRender(cell.column.columnDef.cell, cell.getContext())}
									/>
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

  <div class="flex items-center justify-end space-x-2 py-4">
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
