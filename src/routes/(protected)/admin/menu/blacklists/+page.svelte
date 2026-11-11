<script lang="ts">
	import { page } from '$app/state';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { pageHrefFor } from '$dtss/tableState';
	import {
		BlacklistTable,
		TaxonomyConfirmDialog,
		TaxonomySearchField,
		type BlacklistRow
	} from '$features/admin/components/taxonomy';

	let { data } = $props();

	let removeOpen = $state(false);
	let pending = $state<BlacklistRow | null>(null);

	const name = (r: BlacklistRow | null) => (r ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email : 'this professional');
</script>

{#snippet toolbar()}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<TaxonomySearchField label="Search by professional, email or practice" value={data.search ?? ''} />
		<p class="text-sm text-muted-foreground">{data.total ?? 0} {data.total === 1 ? 'block' : 'blocks'}</p>
	</div>
{/snippet}

<Page>
	<PageHeader
		title="Blacklists"
		description="Every professional a practice has blocked, across all practices. Add a block from the practice's profile page; remove it here or there."
	/>

	<BlacklistTable
		rows={(data.entries as BlacklistRow[]) ?? []}
		search={data.search ?? ''}
		pagination={{ page: data.page ?? 1, pageSize: data.limit ?? 25, total: data.total ?? 0, href: (p) => pageHrefFor(page.url, p) }}
		{toolbar}
		onRemove={(r) => {
			pending = r;
			removeOpen = true;
		}}
	/>
</Page>

<TaxonomyConfirmDialog
	bind:open={removeOpen}
	title="Unblock {name(pending)} for {pending?.companyName ?? 'this practice'}?"
	description="{name(pending)} can be matched with {pending?.companyName ?? 'this practice'} again. Shifts that were cancelled by the block are not restored."
	action="?/removeBlacklist"
	fields={{ candidateId: pending?.candidateId ?? '', companyId: pending?.companyId ?? '' }}
	confirmLabel="Remove block"
/>
