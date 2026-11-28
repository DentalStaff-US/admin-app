<script lang="ts">
	import { GraduationCap, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn, SortState } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import IconAction from './IconAction.svelte';
	import { shortDate } from './taxonomy';

	export type DisciplineRow = {
		id: string;
		name: string;
		abbreviation: string;
		requiresLicense: boolean;
		createdAt: Date | string;
		updatedAt: Date | string;
	};

	let {
		rows,
		search = '',
		sort,
		sortHref,
		onAdd,
		onEdit,
		onDelete
	}: {
		rows: DisciplineRow[];
		search?: string;
		sort?: SortState;
		sortHref?: (column: string) => string;
		onAdd: () => void;
		onEdit: (row: DisciplineRow) => void;
		onDelete: (row: DisciplineRow) => void;
	} = $props();

	const columns: DataColumn<DisciplineRow>[] = [
		{ id: 'name', header: 'Discipline', value: (r) => r.name, sortable: true, class: 'font-semibold' },
		{ id: 'abbreviation', header: 'Abbreviation', value: (r) => r.abbreviation, sortable: true },
		{ id: 'requiresLicense', header: 'License or registration', cell: license, sortable: true },
		{ id: 'createdAt', header: 'Created', value: (r) => shortDate(r.createdAt), sortable: true },
		{ id: 'updatedAt', header: 'Updated', value: (r) => shortDate(r.updatedAt), sortable: true },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px', headerClass: 'w-px' }
	];
</script>

{#snippet license(r: DisciplineRow)}
	{#if r.requiresLicense}
		<span class="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary-dark">
			<ShieldCheck class="size-3.5" aria-hidden="true" /> Required
		</span>
	{:else}
		<span class="text-muted-foreground">Not required</span>
	{/if}
{/snippet}

{#snippet actions(r: DisciplineRow)}
	<div class="flex justify-end gap-1">
		<IconAction label="Edit {r.name}" icon={Pencil} on:click={() => onEdit(r)} />
		<IconAction label="Delete {r.name}" icon={Trash2} destructive on:click={() => onDelete(r)} />
	</div>
{/snippet}

{#snippet mobile(r: DisciplineRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold">{r.name} <span class="font-normal text-muted-foreground">· {r.abbreviation}</span></p>
			<p class="mt-0.5 text-sm text-muted-foreground">
				{r.requiresLicense ? 'License or registration required' : 'No license required'} · Updated {shortDate(r.updatedAt)}
			</p>
		</div>
		{@render actions(r)}
	</div>
{/snippet}

{#snippet empty()}
	{#if search}
		<EmptyState icon={GraduationCap} title="No results for “{search}”" description="Try a different name or abbreviation." />
	{:else}
		<EmptyState icon={GraduationCap} title="No disciplines yet" description="Disciplines are the roles professionals hold and practices request.">
			<Button on:click={onAdd}><Plus class="mr-2 size-4" aria-hidden="true" />Add discipline</Button>
		</EmptyState>
	{/if}
{/snippet}

<DataTable {rows} {columns} key={(r) => r.id} caption="Disciplines" {sort} {sortHref} {mobile} {empty} />
