<script lang="ts">
	import { Archive, ArchiveRestore, FileBadge, Pencil, Plus, Trash2 } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import IconAction from './IconAction.svelte';
	import ReorderButtons from './ReorderButtons.svelte';
	import { plural } from './taxonomy';

	export type SkillRow = {
		id: string;
		name: string;
		categoryId: string;
		requiresCertificate: boolean;
		archivedAt: Date | string | null;
		candidateCount: number;
		requisitionCount: number;
	};

	let {
		category,
		rows,
		search = '',
		onAdd,
		onEdit,
		onArchive,
		onDelete
	}: {
		/** One table per category; sort order is per category. */
		category: { id: string; name: string; archivedAt: Date | string | null };
		rows: SkillRow[];
		search?: string;
		onAdd: (categoryId: string) => void;
		onEdit: (row: SkillRow) => void;
		onArchive: (row: SkillRow) => void;
		onDelete: (row: SkillRow) => void;
	} = $props();

	const ids = $derived(rows.map((r) => r.id));
	const deletable = (r: SkillRow) => r.candidateCount === 0 && r.requisitionCount === 0;

	const columns: DataColumn<SkillRow>[] = [
		{ id: 'order', header: 'Order', cell: order, class: 'w-px', headerClass: 'w-px' },
		{ id: 'name', header: 'Skill', cell: skill },
		{ id: 'usage', header: 'Held / required by', cell: usage },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px', headerClass: 'w-px' }
	];
</script>

{#snippet order(r: SkillRow)}
	<ReorderButtons {ids} id={r.id} name={r.name} disabled={!!search} />
{/snippet}

{#snippet skill(r: SkillRow)}
	<div class="flex flex-wrap items-center gap-2 {r.archivedAt ? 'opacity-70' : ''}">
		<span class="font-semibold">{r.name}</span>
		{#if r.requiresCertificate}
			<span class="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary-soft px-2 text-xs font-bold leading-5 text-primary-dark">
				<FileBadge class="size-3" aria-hidden="true" /> Certificate required
			</span>
		{/if}
		{#if r.archivedAt}<StatusBadge status="ARCHIVED" />{/if}
	</div>
{/snippet}

{#snippet usage(r: SkillRow)}
	<span class="whitespace-nowrap text-sm text-muted-foreground">
		{plural(r.candidateCount, 'professional')} · {plural(r.requisitionCount, 'requisition')}
	</span>
{/snippet}

{#snippet actions(r: SkillRow)}
	<div class="flex justify-end gap-1">
		<IconAction label="Edit {r.name}" icon={Pencil} on:click={() => onEdit(r)} />
		<IconAction label="{r.archivedAt ? 'Restore' : 'Archive'} {r.name}" icon={r.archivedAt ? ArchiveRestore : Archive} on:click={() => onArchive(r)} />
		{#if deletable(r)}
			<IconAction label="Delete {r.name}" icon={Trash2} destructive on:click={() => onDelete(r)} />
		{/if}
	</div>
{/snippet}

{#snippet mobile(r: SkillRow)}
	<div class="flex items-start gap-2">
		{@render order(r)}
		<div class="min-w-0 flex-1">
			{@render skill(r)}
			<p class="mt-1">{@render usage(r)}</p>
		</div>
	</div>
	<div class="mt-2">{@render actions(r)}</div>
{/snippet}

{#snippet toolbar()}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="text-h3">{category.name}</h2>
			{#if category.archivedAt}<StatusBadge status="ARCHIVED" />{/if}
			<span class="text-sm text-muted-foreground">{plural(rows.length, 'skill')}</span>
		</div>
		{#if !category.archivedAt}
			<Button variant="outline" size="sm" on:click={() => onAdd(category.id)}>
				<Plus class="mr-1.5 size-4" aria-hidden="true" />Add skill<span class="sr-only"> to {category.name}</span>
			</Button>
		{/if}
	</div>
{/snippet}

{#snippet empty()}
	<p class="py-2 text-center text-sm text-muted-foreground">No skills in this category yet.</p>
{/snippet}

<div id="category-{category.id}" class="scroll-mt-24">
	<DataTable {rows} {columns} key={(r) => r.id} caption="{category.name} skills" {toolbar} {mobile} {empty} />
</div>
