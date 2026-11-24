<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Pencil } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import DataTable from '$dtss/DataTable.svelte';
	import type { DataColumn, Pagination, SortState } from '$dtss/tableState';
	import type { LocationRow } from '../../lists';
	import EditLocationDialog from './EditLocationDialog.svelte';

	let {
		rows,
		hrefFor,
		sort,
		sortHref,
		pagination,
		empty,
		caption = 'Office locations',
		editAction,
		class: className
	}: {
		rows: LocationRow[];
		hrefFor: (row: LocationRow) => string;
		sort?: SortState;
		sortHref?: (column: string) => string;
		pagination?: Pagination;
		empty?: Snippet;
		caption?: string;
		/** Form action for the row's Edit button; without one the table is read-only. */
		editAction?: string;
		class?: string;
	} = $props();

	let editOpen = $state(false);
	let editing = $state<LocationRow | null>(null);

	const columns: DataColumn<LocationRow>[] = $derived([
		{ id: 'location_name', header: 'Name', value: (r) => r.location_name || 'Unnamed location', sortable: true },
		{ id: 'complete_address', header: 'Address', value: (r) => r.complete_address || '—', sortable: true },
		{ id: 'company_phone', header: 'Phone', value: (r) => r.company_phone || '—', class: 'whitespace-nowrap tabular-nums' },
		...(editAction ? [{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell, class: 'text-right' }] : [])
	]);
</script>

{#snippet actionsCell(r: LocationRow)}
	<Button
		variant="ghost"
		size="icon"
		class="size-9"
		aria-label="Edit {r.location_name || 'location'}"
		on:click={() => {
			editing = r;
			editOpen = true;
		}}
	>
		<Pencil class="size-4" aria-hidden="true" />
	</Button>
{/snippet}

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
	class={className}
/>

{#if editAction}
	<EditLocationDialog bind:open={editOpen} location={editing} action={editAction} href={editing ? hrefFor(editing) : undefined} />
{/if}
