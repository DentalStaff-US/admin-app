<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Building2, Plus } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { sortHrefFor } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import { buildClientFiltersHref, type ClientFilterChanges } from '$lib/_helpers/client-filters';
	import {
		AddPersonDialog,
		CLIENT_SORT,
		ClientsTable,
		ListSearch,
		readOptionalSort,
		sortRows,
		type ClientRow
	} from '$features/people';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type StatusKey = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'DENIED';
	const TABS: { value: StatusKey; label: string }[] = [
		{ value: 'ACTIVE', label: 'Active' },
		{ value: 'PENDING', label: 'Pending' },
		{ value: 'INACTIVE', label: 'Inactive' },
		{ value: 'DENIED', label: 'Denied' }
	];

	let addOpen = $state(false);

	const activeTab = $derived((data.status as StatusKey) || 'ACTIVE');
	const filters = $derived(data.filters);
	const appliedSearch = $derived(data.searchTerm ?? '');
	const sort = $derived(readOptionalSort(page.url, Object.keys(CLIENT_SORT)));
	const rows = $derived(sortRows((data.clients ?? []) as ClientRow[], sort, CLIENT_SORT));
	const statusCounts = $derived(data.statusCounts as Record<StatusKey, number>);

	const dimensions = $derived([
		{ key: 'city', label: 'City', options: data.facets.cities, selected: filters.cities ?? [] },
		{ key: 'state', label: 'State', options: data.facets.states, selected: filters.states ?? [] },
		{ key: 'zip', label: 'Zip', options: data.facets.zipcodes, selected: filters.zipcodes ?? [] }
	] satisfies FilterDimension[]);
	const filtered = $derived(Boolean(appliedSearch) || dimensions.some((d) => d.selected.length > 0));

	// Merges onto the current params, so tabs and search keep the city/state/zip chips.
	function apply(changes: ClientFilterChanges, replaceState = false) {
		goto(buildClientFiltersHref(page.url.searchParams, changes), {
			keepFocus: true,
			noScroll: true,
			replaceState
		});
	}

	const tabHref = (status: StatusKey) => buildClientFiltersHref(page.url.searchParams, { status });
	const clearAll = () => apply({ search: null, city: [], state: [], zip: [] });
</script>

{#snippet tabs()}
	<TabsWithCounts
		label="Client status"
		active={activeTab}
		tabs={TABS.map((t) => ({ ...t, href: tabHref(t.value), count: statusCounts?.[t.value] ?? 0, tone: t.value === 'PENDING' ? 'pending' : undefined }))}
	/>
{/snippet}

{#snippet toolbar()}
	<div class="flex flex-col gap-3">
		<!-- Each search runs the list plus three facet counts, so wait for typing to settle. -->
		<ListSearch
			applied={appliedSearch}
			label="Search clients"
			placeholder="Search name, email, practice, address…"
			onSearch={(value) => apply({ search: value }, true)}
		/>
		<FilterBar
			{dimensions}
			searchTerm={appliedSearch || null}
			on:change={(e) => apply({ [e.detail.key]: e.detail.values } as ClientFilterChanges)}
			on:clearSearch={() => apply({ search: null })}
			on:clearAll={clearAll}
		/>
	</div>
{/snippet}

{#snippet empty()}
	{#if filtered}
		<EmptyState icon={Building2} title="No matches" description="No {activeTab.toLowerCase()} clients match these filters.">
			<Button variant="outline" on:click={clearAll}>Clear filters</Button>
		</EmptyState>
	{:else}
		<EmptyState icon={Building2} title="No {activeTab.toLowerCase()} clients" description="Practices appear here as they sign up or you add them.">
			<Button on:click={() => (addOpen = true)}>Add client</Button>
		</EmptyState>
	{/if}
{/snippet}

<Page>
	<PageHeader title="Clients" description="Practices and their owners, by status.">
		{#snippet actions()}
			<Button class="gap-2" on:click={() => (addOpen = true)}><Plus class="size-4" aria-hidden="true" />Add client</Button>
		{/snippet}
	</PageHeader>

	<ClientsTable
		{rows}
		sort={sort ?? undefined}
		sortHref={(column) => sortHrefFor(page.url, sort ?? { column: '', direction: 'desc' }, column)}
		highlightCities={filters.cities ?? []}
		highlightStates={filters.states ?? []}
		{tabs}
		{toolbar}
		{empty}
	/>
	{#if rows.length > 0}
		<p class="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? 'client' : 'clients'}</p>
	{/if}
</Page>

<AddPersonDialog
	bind:open={addOpen}
	form={data.newProfileForm}
	action="?/adminCreateClient"
	title="Add a client"
	description="Creates the owner's account and their practice. Fill in the rest on the next page."
	withCompany
/>
