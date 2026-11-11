<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Users } from 'lucide-svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { sortHrefFor, withParam } from '$dtss/tableState';
	import AddStaffToLocation from '$lib/components/dialogs/inviteNewStaffDialog.svelte';
	import {
		ListSearch,
		STAFF_SORT,
		STAFF_TABS,
		StaffDetailsDialog,
		StaffTable,
		readOptionalSort,
		readTab,
		sortRows,
		staffForTab,
		type StaffRow
	} from '$features/people';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let detailsOpen = $state(false);
	let selected = $state<StaffRow | null>(null);

	const staff = $derived((data?.staff ?? []) as StaffRow[]);
	const searchTerm = $derived(data?.searchTerm ?? '');
	// Role tabs filter the loaded list, so they live in `?role=` like any other filter.
	const tab = $derived(readTab(page.url.searchParams.get('role'), STAFF_TABS.map((t) => t.value)));
	const sort = $derived(readOptionalSort(page.url, Object.keys(STAFF_SORT)));
	const rows = $derived(sortRows(staffForTab(staff, tab), sort, STAFF_SORT));

	function search(value: string) {
		const term = value.trim();
		goto(term ? withParam(page.url, 'search', term) : withParam(page.url, 'search', null), {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	function open(row: StaffRow) {
		selected = row;
		detailsOpen = true;
	}
</script>

<svelte:head>
	<title>Staff | DTSS</title>
</svelte:head>

{#snippet tabs()}
	<TabsWithCounts
		label="Staff role"
		active={tab}
		tabs={STAFF_TABS.map((t) => ({
			value: t.value,
			label: t.label,
			href: withParam(page.url, 'role', t.value === 'all' ? null : t.value),
			count: staffForTab(staff, t.value).length
		}))}
	/>
{/snippet}

{#snippet toolbar()}
	<ListSearch applied={searchTerm} label="Search staff" placeholder="Search name or email…" delay={400} onSearch={search} />
{/snippet}

{#snippet empty()}
	{#if searchTerm}
		<EmptyState icon={Users} title="No matches" description="No staff match “{searchTerm}”. Try another name or email." />
	{:else if tab !== 'all'}
		<EmptyState icon={Users} title="Nobody in this role yet" description="Staff with this role show up here once they accept an invite." />
	{:else}
		<EmptyState icon={Users} title="No staff members yet" description="Invite your team with “Add staff to location” above." />
	{/if}
{/snippet}

<Page>
	<PageHeader title="Staff" description="Your team members and their roles.">
		{#snippet actions()}
			{#if data?.company}
				<AddStaffToLocation open={false} inviteForm={data.inviteForm} locations={data.locations} company={data.company} />
			{/if}
		{/snippet}
	</PageHeader>

	<StaffTable
		{rows}
		sort={sort ?? undefined}
		sortHref={(column) => sortHrefFor(page.url, sort ?? { column: '', direction: 'desc' }, column)}
		onOpen={open}
		{tabs}
		{toolbar}
		{empty}
	/>
</Page>

<StaffDetailsDialog bind:open={detailsOpen} member={selected} />
