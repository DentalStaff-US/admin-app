<script lang="ts">
	import { page } from '$app/state';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { pageHrefFor, readPage, readSort, sortHrefFor, withParam } from '$dtss/tableState';
	import {
		documentCandidateName,
		TaxonomyConfirmDialog,
		DOCUMENT_TYPES,
		DocumentsTable,
		documentTypeLabel,
		filterDocuments,
		isExpiringSoon,
		isGatingExpired,
		pageLoadedRows,
		TaxonomySearchField,
		sortLoadedRows,
		type CredentialFilter,
		type DocumentRow,
		type DocumentType
	} from '$features/admin/components/taxonomy';

	let { data } = $props();

	const PAGE_SIZE = 10;
	const SORTABLE = ['filename', 'candidate', 'type', 'disciplineAbbreviation', 'expiryDate', 'createdAt'];

	let deleteOpen = $state(false);
	let toDelete = $state<DocumentRow | null>(null);

	const documents = $derived((data.documents as DocumentRow[]) ?? []);
	const search = $derived(page.url.searchParams.get('search') ?? '');
	const type = $derived.by<DocumentType | 'ALL'>(() => {
		const value = page.url.searchParams.get('type')?.toUpperCase();
		return (DOCUMENT_TYPES as readonly string[]).includes(value ?? '') ? (value as DocumentType) : 'ALL';
	});
	const credential = $derived.by<CredentialFilter>(() => {
		const value = page.url.searchParams.get('credential')?.toUpperCase();
		return value === 'EXPIRED' || value === 'EXPIRING' ? value : 'ALL';
	});
	const sort = $derived(readSort(page.url, SORTABLE, { column: 'createdAt', direction: 'desc' }));

	const filtered = $derived(filterDocuments(documents, type, credential));
	const sorted = $derived(
		sortLoadedRows(filtered, {
			filename: (d) => d.filename?.toLowerCase() ?? '',
			candidate: (d) => (d.candidateLastName || d.candidateFirstName || '').toLowerCase(),
			type: (d) => d.type,
			disciplineAbbreviation: (d) => d.disciplineAbbreviation,
			// ISO date strings sort lexicographically; nulls go last.
			expiryDate: (d) => d.expiryDate,
			createdAt: (d) => new Date(d.createdAt).getTime()
		}, sort)
	);
	const paged = $derived(pageLoadedRows(sorted, readPage(page.url), PAGE_SIZE));

	const typeTabs = $derived([
		{ value: 'ALL', label: 'All', href: withParam(page.url, 'type', null), count: documents.length },
		...DOCUMENT_TYPES.map((t) => ({
			value: t,
			label: documentTypeLabel(t),
			href: withParam(page.url, 'type', t.toLowerCase()),
			count: documents.filter((d) => d.type === t).length
		}))
	]);
	// Only documents linked to a discipline that requires one: the real "who is blocked" queue.
	const credentialTabs = $derived([
		{ value: 'ALL', label: 'All credentials', href: withParam(page.url, 'credential', null) },
		{ value: 'EXPIRED', label: 'Expired', href: withParam(page.url, 'credential', 'expired'), count: documents.filter((d) => isGatingExpired(d)).length, tone: 'negative' as const },
		{ value: 'EXPIRING', label: 'Expiring soon', href: withParam(page.url, 'credential', 'expiring'), count: documents.filter((d) => isExpiringSoon(d)).length, tone: 'warning' as const }
	]);
</script>

{#snippet tabs()}
	<div class="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
		<TabsWithCounts label="Document type" active={type} tabs={typeTabs} />
		<TabsWithCounts label="Credential state" active={credential} tabs={credentialTabs} />
	</div>
{/snippet}

{#snippet toolbar()}
	<TaxonomySearchField label="Search by filename or professional" value={search} />
{/snippet}

<Page width="full">
	<PageHeader title="Documents" description="Every file professionals have uploaded, with credential expiry for the disciplines that require one." />

	<DocumentsTable
		rows={paged.rows}
		{sort}
		sortHref={(column) => sortHrefFor(page.url, sort, column)}
		pagination={{ page: paged.page, pageSize: PAGE_SIZE, total: sorted.length, href: (p) => pageHrefFor(page.url, p) }}
		{tabs}
		{toolbar}
		filtered={!!search || type !== 'ALL' || credential !== 'ALL'}
		onDelete={(d) => {
			toDelete = d;
			deleteOpen = true;
		}}
	/>
</Page>

<TaxonomyConfirmDialog
	bind:open={deleteOpen}
	title="Delete {toDelete?.filename || 'this document'}?"
	description="{toDelete ? `${documentCandidateName(toDelete)}'s ` : 'The '}{toDelete ? documentTypeLabel(toDelete.type).toLowerCase() : 'document'} record is removed from their profile. This can't be undone."
	action="?/deleteDocument"
	fields={{ id: toDelete?.id ?? '' }}
	confirmLabel="Delete document"
	confirmText="DELETE"
/>
