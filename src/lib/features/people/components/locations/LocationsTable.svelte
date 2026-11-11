<script lang="ts">
	import type { Snippet } from 'svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import type { DataColumn, Pagination, SortState } from '$dtss/tableState';
	import type { LocationRow } from '../../lists';

	let {
		rows,
		hrefFor,
		sort,
		sortHref,
		pagination,
		empty,
		caption = 'Office locations'
	}: {
		rows: LocationRow[];
		hrefFor: (row: LocationRow) => string;
		sort?: SortState;
		sortHref?: (column: string) => string;
		pagination?: Pagination;
		empty?: Snippet;
		caption?: string;
	} = $props();

	const columns: DataColumn<LocationRow>[] = [
		{ id: 'location_name', header: 'Name', value: (r) => r.location_name || 'Unnamed location', sortable: true },
		{ id: 'complete_address', header: 'Address', value: (r) => r.complete_address || '—', sortable: true },
		{ id: 'company_phone', header: 'Phone', value: (r) => r.company_phone || '—', class: 'whitespace-nowrap tabular-nums' }
	];
</script>

<DataTable
	{rows}
	{columns}
	key={(r) => r.id}
	rowHref={hrefFor}
	rowLabel={(r) => `Open ${r.location_name || 'location'}`}
	{caption}
	{sort}
	{sortHref}
	{pagination}
	{empty}
/>
