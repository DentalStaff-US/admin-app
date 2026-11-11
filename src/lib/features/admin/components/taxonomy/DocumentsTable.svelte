<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ExternalLink, FileText, Trash2 } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn, Pagination, SortState } from '$dtss/tableState';
	import { formatCertDate } from '$lib/credentialStatusDisplay';
	import IconAction from './IconAction.svelte';
	import { candidateName, documentCredential, type DocumentRow } from './documents';
	import { documentTypeLabel, shortDate } from './taxonomy';

	let {
		rows,
		sort,
		sortHref,
		pagination,
		tabs,
		toolbar,
		filtered = false,
		onDelete
	}: {
		rows: DocumentRow[];
		sort?: SortState;
		sortHref?: (column: string) => string;
		pagination?: Pagination;
		tabs?: Snippet;
		toolbar?: Snippet;
		/** A search or filter is narrowing the list (changes the empty copy). */
		filtered?: boolean;
		onDelete: (row: DocumentRow) => void;
	} = $props();

	const columns: DataColumn<DocumentRow>[] = [
		{ id: 'filename', header: 'File', cell: file, sortable: true },
		{ id: 'candidate', header: 'Professional', cell: professional, sortable: true },
		{ id: 'type', header: 'Type', value: (r) => documentTypeLabel(r.type), sortable: true },
		{ id: 'disciplineAbbreviation', header: 'Applies to', cell: appliesTo, sortable: true },
		{ id: 'expiryDate', header: 'Expires', cell: expires, sortable: true },
		{ id: 'createdAt', header: 'Uploaded', value: (r) => shortDate(r.createdAt), sortable: true },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actions, class: 'w-px', headerClass: 'w-px' }
	];
</script>

{#snippet file(r: DocumentRow)}
	<a
		href={r.uploadUrl}
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex max-w-[16rem] items-center gap-1.5 font-semibold text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<span class="truncate">{r.filename || 'Untitled document'}</span>
		<ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
		<span class="sr-only">(opens in a new tab)</span>
	</a>
{/snippet}

{#snippet professional(r: DocumentRow)}
	<a href="/professionals/{r.candidateId}" class="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
		{candidateName(r)}
	</a>
{/snippet}

{#snippet appliesTo(r: DocumentRow)}
	{#if r.disciplineAbbreviation}
		<span class="whitespace-nowrap">{r.disciplineAbbreviation}{#if !r.requiresLicense}<span class="text-muted-foreground">{' (not required)'}</span>{/if}</span>
	{:else}
		<span class="text-muted-foreground">—</span>
	{/if}
{/snippet}

{#snippet expires(r: DocumentRow)}
	{@const credential = documentCredential(r)}
	{#if !r.expiryDate}
		<span class="text-muted-foreground">—</span>
	{:else}
		<div class="flex flex-col items-start gap-1">
			<span class="tabular-nums">{formatCertDate(r.expiryDate)}</span>
			{#if credential && credential.state !== 'VALID'}
				<StatusBadge status={credential.state} label={credential.label} />
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet actions(r: DocumentRow)}
	<div class="flex justify-end">
		<IconAction label="Delete {r.filename || 'document'}" icon={Trash2} destructive on:click={() => onDelete(r)} />
	</div>
{/snippet}

{#snippet mobile(r: DocumentRow)}
	{@const credential = documentCredential(r)}
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 space-y-1">
			{@render file(r)}
			<p class="text-sm">{@render professional(r)}</p>
			<p class="text-sm text-muted-foreground">
				{documentTypeLabel(r.type)}{r.disciplineAbbreviation ? ` · ${r.disciplineAbbreviation}` : ''} · Uploaded {shortDate(r.createdAt)}
			</p>
			{#if r.expiryDate}
				<p class="text-sm text-muted-foreground">Expires {formatCertDate(r.expiryDate)}</p>
			{/if}
			{#if credential && credential.state !== 'VALID'}
				<StatusBadge status={credential.state} label={credential.label} />
			{/if}
		</div>
		{@render actions(r)}
	</div>
{/snippet}

{#snippet empty()}
	{#if filtered}
		<EmptyState icon={FileText} title="No documents match" description="Try another search, type or credential filter." />
	{:else}
		<EmptyState icon={FileText} title="No documents yet" description="Documents appear here as professionals upload resumes, licenses and certificates." />
	{/if}
{/snippet}

<DataTable {rows} {columns} key={(r) => r.id} caption="Uploaded documents" {sort} {sortHref} {pagination} {tabs} {toolbar} {mobile} {empty} />
