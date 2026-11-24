<script lang="ts">
	import { page } from '$app/state';
	import { MapPin } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import AddLocationDrawer from '$lib/components/drawers/addLocationDrawer.svelte';
	import {
		LocationsTable,
		locationPageHref,
		locationSortHref,
		readLocationSort,
		type LocationRow
	} from '$features/people';

	let { data } = $props();

	// The load pages by `?skip=` in steps of 10 and sorts by `?sortOn=&sortBy=`.
	const PAGE_SIZE = 10;
	let drawerOpen = $state(false);

	const rows = $derived((data.locations ?? []) as unknown as LocationRow[]);
	const skip = $derived(Number(page.url.searchParams.get('skip')) || 0);
</script>

{#snippet empty()}
	<EmptyState icon={MapPin} title="No locations yet" description="Add your first office so you can post requisitions and invite staff to it." />
{/snippet}

<Page>
	<PageHeader title="Locations" description="Your offices. Each one has its own hours, staff and parking notes.">
		{#snippet actions()}
			{#if data.company}
				<AddLocationDrawer newLocationForm={data.locationForm} company={data.company} bind:open={drawerOpen} />
			{/if}
		{/snippet}
	</PageHeader>

	<LocationsTable
		{rows}
		hrefFor={(r) => `/locations/${r.id}`}
		editAction="?/updateLocationInfo"
		sort={readLocationSort(page.url)}
		sortHref={(column) => locationSortHref(page.url, column)}
		pagination={{
			page: Math.floor(skip / PAGE_SIZE) + 1,
			pageSize: PAGE_SIZE,
			total: data.count ?? 0,
			href: (p) => locationPageHref(page.url, p, PAGE_SIZE)
		}}
		{empty}
	/>
</Page>
