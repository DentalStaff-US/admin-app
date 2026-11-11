<script lang="ts">
	import { Archive, ArchiveRestore, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import IconAction from './IconAction.svelte';
	import ReorderButtons from './ReorderButtons.svelte';
	import { plural } from './taxonomy';

	export type SkillCategoryRow = {
		id: string;
		name: string;
		description: string | null;
		archivedAt: Date | string | null;
		disciplineIds: string[];
		skillCount: number;
		requisitionCount: number;
	};

	let {
		rows,
		disciplineName,
		search = '',
		onAdd,
		onEdit,
		onArchive,
		onDelete
	}: {
		rows: SkillCategoryRow[];
		/** id → abbreviation (or name) for the discipline chips. */
		disciplineName: Map<string, string>;
		search?: string;
		onAdd: () => void;
		onEdit: (row: SkillCategoryRow) => void;
		/** Archive or restore, depending on the row. */
		onArchive: (row: SkillCategoryRow) => void;
		onDelete: (row: SkillCategoryRow) => void;
	} = $props();

	const ids = $derived(rows.map((r) => r.id));
	const deletable = (r: SkillCategoryRow) => r.skillCount === 0 && r.requisitionCount === 0;

	const columns: DataColumn<SkillCategoryRow>[] = [
		{ id: 'order', header: 'Order', cell: order, class: 'w-px', headerClass: 'w-px' },
		{ id: 'name', header: 'Category', cell: category },
		{ id: 'usage', header: 'Used by', cell: usage },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px', headerClass: 'w-px' }
	];
</script>

{#snippet order(r: SkillCategoryRow)}
	<ReorderButtons {ids} id={r.id} name={r.name} disabled={!!search} />
{/snippet}

{#snippet chips(r: SkillCategoryRow)}
	<div class="mt-1.5 flex flex-wrap gap-1">
		{#if r.disciplineIds.length === 0}
			<span class="rounded-full border px-2 text-xs font-semibold leading-5 text-muted-foreground">All disciplines</span>
		{:else}
			{#each r.disciplineIds as d (d)}
				<span class="rounded-full border bg-muted/50 px-2 text-xs font-semibold leading-5 text-foreground">{disciplineName.get(d) ?? d}</span>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet category(r: SkillCategoryRow)}
	<div class={r.archivedAt ? 'opacity-70' : ''}>
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-semibold">{r.name}</span>
			{#if r.archivedAt}<StatusBadge status="ARCHIVED" />{/if}
		</div>
		{#if r.description}<p class="mt-0.5 text-sm text-muted-foreground">{r.description}</p>{/if}
		{@render chips(r)}
	</div>
{/snippet}

{#snippet usage(r: SkillCategoryRow)}
	<span class="whitespace-nowrap text-sm text-muted-foreground">
		{plural(r.skillCount, 'skill')} · {plural(r.requisitionCount, 'request')}
	</span>
{/snippet}

{#snippet actions(r: SkillCategoryRow)}
	<div class="flex justify-end gap-1">
		<IconAction label="Edit {r.name}" icon={Pencil} on:click={() => onEdit(r)} />
		<IconAction
			label="{r.archivedAt ? 'Restore' : 'Archive'} {r.name}"
			icon={r.archivedAt ? ArchiveRestore : Archive}
			on:click={() => onArchive(r)}
		/>
		{#if deletable(r)}
			<IconAction label="Delete {r.name}" icon={Trash2} destructive on:click={() => onDelete(r)} />
		{/if}
	</div>
{/snippet}

{#snippet mobile(r: SkillCategoryRow)}
	<div class="flex items-start gap-2">
		{@render order(r)}
		<div class="min-w-0 flex-1">
			{@render category(r)}
			<p class="mt-1">{@render usage(r)}</p>
		</div>
	</div>
	<div class="mt-2">{@render actions(r)}</div>
{/snippet}

{#snippet empty()}
	{#if search}
		<EmptyState icon={FolderOpen} title="No results for “{search}”" description="Try a different category name." />
	{:else}
		<EmptyState icon={FolderOpen} title="No skill categories yet" description="Categories group skills, and practices set a requirement per category on each request.">
			<Button on:click={onAdd}><Plus class="mr-2 size-4" aria-hidden="true" />Add category</Button>
		</EmptyState>
	{/if}
{/snippet}

<DataTable {rows} {columns} key={(r) => r.id} caption="Skill categories, in display order" {mobile} {empty} />
