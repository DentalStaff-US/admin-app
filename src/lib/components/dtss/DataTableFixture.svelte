<script lang="ts">
	// Test fixture for DataTable.
	import DataTable from './DataTable.svelte';
	import type { DataColumn } from './tableState';

	type Row = { id: number; name: string; hours: number };
	let { rows, withHref = true }: { rows: Row[]; withHref?: boolean } = $props();

	const columns: DataColumn<Row>[] = [
		{ id: 'name', header: 'Name', value: (r) => r.name, sortable: true },
		{ id: 'hours', header: 'Hours', value: (r) => r.hours, numeric: true, sortable: true },
		{ id: 'menu', header: 'Actions', srOnlyHeader: true, cell: menu }
	];
</script>

{#snippet menu(row: Row)}<button type="button">Menu {row.id}</button>{/snippet}
{#snippet empty()}<p>No people yet</p>{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => r.id}
	rowHref={withHref ? (r) => `/people/${r.id}` : undefined}
	rowLabel={(r) => `Open ${r.name}`}
	sort={{ column: 'hours', direction: 'asc' }}
	sortHref={(c) => `?sort=${c}`}
	pagination={{ page: 1, pageSize: 2, total: 3, href: (p) => `?page=${p}` }}
	caption="People"
	{empty}
/>
