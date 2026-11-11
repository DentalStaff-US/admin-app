<script lang="ts">
	// Test fixture for svelte-table.ts, written the way the existing tables are
	// (Svelte 4 syntax, store + svelte:component). Temporary with the shim.
	import { Badge } from '$lib/components/ui/badge';
	import {
		createSvelteTable,
		flexRender,
		getCoreRowModel,
		getSortedRowModel,
		type ColumnDef,
		type TableOptions
	} from './svelte-table';
	import { writable } from 'svelte/store';

	type Row = { name: string; status: string; hours: number };
	export let rows: Row[];

	const columns: ColumnDef<Row>[] = [
		{ accessorKey: 'name', header: 'Name' },
		{
			accessorKey: 'status',
			header: () => 'Status',
			cell: (info) => flexRender(Badge, { variant: 'outline', value: info.getValue() as string })
		},
		{ accessorKey: 'hours', header: 'Hours', cell: (info) => `${info.getValue()} hrs` }
	];

	const options = writable<TableOptions<Row>>({
		data: rows,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});
	const table = createSvelteTable(options);
</script>

<table>
	<thead>
		{#each $table.getHeaderGroups() as group}
			<tr>
				{#each group.headers as header}
					<th>
						<button on:click={header.column.getToggleSortingHandler()}>
							<svelte:component this={flexRender(header.column.columnDef.header, header.getContext())} />
						</button>
					</th>
				{/each}
			</tr>
		{/each}
	</thead>
	<tbody>
		{#each $table.getRowModel().rows as row}
			<tr>
				{#each row.getVisibleCells() as cell}
					<td><svelte:component this={flexRender(cell.column.columnDef.cell, cell.getContext())} /></td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
