<script lang="ts">
	import { ArrowDown, ArrowUp, Plus, Trash2, Trophy } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import IconAction from './IconAction.svelte';
	import { shortDate } from './taxonomy';

	export type ExperienceLevelRow = {
		id: string;
		value: string;
		order: number;
		createdAt: Date | string;
		updatedAt: Date | string;
	};

	let {
		rows,
		search = '',
		toolbar,
		onMove,
		onAdd,
		onDelete
	}: {
		/** In the working (possibly unsaved) order. */
		rows: ExperienceLevelRow[];
		search?: string;
		toolbar?: import('svelte').Snippet;
		onMove: (index: number, delta: -1 | 1) => void;
		onAdd: () => void;
		onDelete: (row: ExperienceLevelRow) => void;
	} = $props();

	const position = (r: ExperienceLevelRow) => rows.findIndex((x) => x.id === r.id);

	const columns: DataColumn<ExperienceLevelRow>[] = [
		{ id: 'position', header: 'Position', cell: move, class: 'w-px', headerClass: 'w-px' },
		{ id: 'value', header: 'Experience level', value: (r) => r.value, class: 'font-semibold' },
		{ id: 'createdAt', header: 'Created', value: (r) => shortDate(r.createdAt), class: 'hidden sm:table-cell', headerClass: 'hidden sm:table-cell' },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px', headerClass: 'w-px' }
	];
</script>

{#snippet move(r: ExperienceLevelRow)}
	{@const i = position(r)}
	<div class="flex items-center gap-1">
		<span class="w-6 text-right tabular-nums text-muted-foreground">{i + 1}</span>
		<IconAction label="Move {r.value} up" icon={ArrowUp} disabled={i === 0} on:click={() => onMove(i, -1)} />
		<IconAction label="Move {r.value} down" icon={ArrowDown} disabled={i === rows.length - 1} on:click={() => onMove(i, 1)} />
	</div>
{/snippet}

{#snippet actions(r: ExperienceLevelRow)}
	<div class="flex justify-end">
		<IconAction label="Delete {r.value}" icon={Trash2} destructive on:click={() => onDelete(r)} />
	</div>
{/snippet}

{#snippet empty()}
	{#if search}
		<EmptyState icon={Trophy} title="No results for “{search}”" description="Try a different search." />
	{:else}
		<EmptyState icon={Trophy} title="No experience levels yet" description="Professionals pick one of these for each discipline they hold.">
			<Button on:click={onAdd}><Plus class="mr-2 size-4" aria-hidden="true" />Add experience level</Button>
		</EmptyState>
	{/if}
{/snippet}

<DataTable {rows} {columns} key={(r) => r.id} caption="Experience levels, in display order" {empty} {toolbar} />
