<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Ban, Trash2 } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn, Pagination } from '$dtss/tableState';
	import IconAction from './IconAction.svelte';
	import { shortDate } from './taxonomy';

	export type BlacklistRow = {
		candidateId: string;
		companyId: string;
		firstName: string | null;
		lastName: string | null;
		email: string;
		avatarUrl: string | null;
		companyName: string | null;
		createdAt: string | Date;
	};

	let {
		rows,
		pagination,
		toolbar,
		search = '',
		onRemove
	}: {
		rows: BlacklistRow[];
		pagination?: Pagination;
		toolbar?: Snippet;
		search?: string;
		onRemove: (row: BlacklistRow) => void;
	} = $props();

	const fullName = (r: BlacklistRow) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '(no name)';

	const columns: DataColumn<BlacklistRow>[] = [
		{ id: 'name', header: 'Professional', value: fullName },
		{ id: 'email', header: 'Email', value: (r) => r.email, class: 'text-muted-foreground' },
		{ id: 'company', header: 'Practice', value: (r) => r.companyName ?? '—' },
		{ id: 'createdAt', header: 'Blocked on', value: (r) => shortDate(r.createdAt) },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px', headerClass: 'w-px' }
	];
</script>

{#snippet actions(r: BlacklistRow)}
	<div class="flex justify-end">
		<IconAction
			label="Remove the block between {fullName(r)} and {r.companyName ?? 'this practice'}"
			icon={Trash2}
			destructive
			on:click={() => onRemove(r)}
		/>
	</div>
{/snippet}

{#snippet mobile(r: BlacklistRow)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="font-semibold">{fullName(r)}</p>
			<p class="truncate text-sm text-muted-foreground">{r.email}</p>
			<p class="mt-1 text-sm">Blocked by <span class="font-semibold">{r.companyName ?? '—'}</span> · {shortDate(r.createdAt)}</p>
		</div>
		<!-- Above the card's stretched link. -->
		<div class="relative z-10">{@render actions(r)}</div>
	</div>
{/snippet}

{#snippet empty()}
	{#if search}
		<EmptyState icon={Ban} title="No results for “{search}”" description="Try a professional's name or email, or a practice name." />
	{:else}
		<EmptyState icon={Ban} title="No blocked professionals" description="Blocks are added from a practice's profile page, and every one shows up here." />
	{/if}
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => `${r.candidateId}:${r.companyId}`}
	rowHref={(r) => `/professionals/${r.candidateId}`}
	rowLabel={(r) => `${fullName(r)}, blocked by ${r.companyName ?? 'a practice'}`}
	caption="Professionals blocked by a practice"
	{pagination}
	{toolbar}
	{mobile}
	{empty}
/>
