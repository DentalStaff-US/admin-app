<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Plus, Users } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { sortHrefFor } from '$dtss/tableState';
	import { Button } from '$lib/components/ui/button';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import type { FilterDimension } from '$lib/components/filters/types';
	import {
		buildProfessionalFiltersHref,
		type ProfessionalFilterChanges
	} from '$lib/_helpers/professional-filters';
	import {
		AddPersonDialog,
		ListSearch,
		PROFESSIONAL_SORT,
		ProfessionalsTable,
		readOptionalSort,
		sortRows,
		type ProfessionalRow
	} from '$features/people';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type StatusKey = 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'DENIED';
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
	const sort = $derived(readOptionalSort(page.url, Object.keys(PROFESSIONAL_SORT)));
	const rows = $derived(sortRows((data.candidates ?? []) as ProfessionalRow[], sort, PROFESSIONAL_SORT));

	const dimensions = $derived([
		{ key: 'discipline', label: 'Discipline', options: data.facets.disciplines, selected: filters.disciplineIds ?? [] },
		{ key: 'city', label: 'City', options: data.facets.cities, selected: filters.cities ?? [] },
		{ key: 'state', label: 'State', options: data.facets.states, selected: filters.states ?? [] },
		{ key: 'zip', label: 'Zip', options: data.facets.zipcodes, selected: filters.zipcodes ?? [] }
	] satisfies FilterDimension[]);
	const filtered = $derived(Boolean(appliedSearch) || dimensions.some((d) => d.selected.length > 0));

	// Merges onto the current params, so tabs, search and chips keep each other.
	function apply(changes: ProfessionalFilterChanges, replaceState = false) {
		goto(buildProfessionalFiltersHref(page.url.searchParams, changes), {
			keepFocus: true,
			noScroll: true,
			replaceState
		});
	}

	const tabHref = (status: StatusKey) => buildProfessionalFiltersHref(page.url.searchParams, { status });
	const clearAll = () => apply({ search: null, discipline: [], city: [], state: [], zip: [] });
</script>

{#snippet tabs()}
	<TabsWithCounts
		label="Professional status"
		active={activeTab}
		tabs={TABS.map((t) => ({ ...t, href: tabHref(t.value), count: data.statusCounts?.[t.value] ?? 0, tone: t.value === 'PENDING' ? 'pending' : undefined }))}
	/>
{/snippet}

{#snippet toolbar()}
	<div class="flex flex-col gap-3">
		<!-- Each search runs the list plus four facet counts, so wait for typing to settle. -->
		<ListSearch
			applied={appliedSearch}
			label="Search professionals"
			placeholder="Search name, email, cell, address…"
			onSearch={(value) => apply({ search: value }, true)}
		/>
		<FilterBar
			{dimensions}
			searchTerm={appliedSearch || null}
			on:change={(e) => apply({ [e.detail.key]: e.detail.values } as ProfessionalFilterChanges)}
			on:clearSearch={() => apply({ search: null })}
			on:clearAll={clearAll}
		/>
	</div>
{/snippet}

{#snippet empty()}
	{#if filtered}
		<EmptyState icon={Users} title="No matches" description="No {activeTab.toLowerCase()} professionals match these filters.">
			<Button variant="outline" on:click={clearAll}>Clear filters</Button>
		</EmptyState>
	{:else}
		<EmptyState icon={Users} title="No {activeTab.toLowerCase()} professionals" description="Professionals appear here as they sign up or you add them.">
			<Button on:click={() => (addOpen = true)}>Add professional</Button>
		</EmptyState>
	{/if}
{/snippet}

<Page>
	<PageHeader title="Professionals" description="Every professional member, by status.">
		{#snippet actions()}
			<Button class="gap-2" on:click={() => (addOpen = true)}><Plus class="size-4" aria-hidden="true" />Add professional</Button>
		{/snippet}
	</PageHeader>

	<ProfessionalsTable
		{rows}
		sort={sort ?? undefined}
		sortHref={(column) => sortHrefFor(page.url, sort ?? { column: '', direction: 'desc' }, column)}
		highlightDisciplineIds={filters.disciplineIds ?? []}
		{tabs}
		{toolbar}
		{empty}
	/>
	{#if rows.length > 0}
		<p class="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? 'professional' : 'professionals'}</p>
	{/if}
</Page>

<AddPersonDialog
	bind:open={addOpen}
	form={data.newProfileForm}
	action="/professionals?/adminCreateProfessional"
	title="Add a professional"
	description="Creates their account with an empty profile. Fill in the rest on the next page."
/>
