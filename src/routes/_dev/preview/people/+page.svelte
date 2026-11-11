<script lang="ts">
	import { page } from '$app/state';
	import { Plus, Users } from 'lucide-svelte';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { Button } from '$lib/components/ui/button';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import PendingInvitesTable from '$lib/components/PendingInvitesTable.svelte';
	import {
		AddPersonDialog,
		ClientDetailPage,
		ClientsTable,
		ListSearch,
		LocationsTable,
		ProfessionalDetailPage,
		ProfessionalsTable,
		StaffDetailsDialog,
		StaffTable
	} from '$features/people';
	import * as fx from './fixtures';
	import PracticeLocationPage from '../../../(protected)/locations/[id]/+page.svelte';
	import AdminLocationPage from '../../../(protected)/clients/[id]/locations/[locationId]/+page.svelte';

	// /_dev/preview/people?screen=pros|…&state=empty&dialog=add
	const q = $derived(page.url.searchParams);
	const screen = $derived(q.get('screen') ?? 'pros');
	const empty = $derived(q.get('state') === 'empty');
	let sidebar = $state<'expanded' | 'rail'>('expanded');
	let addOpen = $state(page.url.searchParams.get('dialog') === 'add');
	let staffOpen = $state(false);
	let staffMember = $state<(typeof fx.staff)[number] | null>(null);
	const path = $derived(
		({ plocation: '/locations', location: '/clients/c1', client: '/clients/c1', pro: '/professionals/p1', pros: '/professionals', clients: '/clients', staff: '/staff', locations: '/locations' } as Record<string, string>)[screen] ?? '/professionals'
	);
</script>

{#snippet proTabs()}
	<TabsWithCounts
		label="Professional status"
		active="ACTIVE"
		tabs={[
			{ value: 'ACTIVE', label: 'Active', href: '?screen=pros', count: 112 },
			{ value: 'PENDING', label: 'Pending', href: '?screen=pros', count: 7, tone: 'pending' },
			{ value: 'INACTIVE', label: 'Inactive', href: '?screen=pros', count: 31 },
			{ value: 'DENIED', label: 'Denied', href: '?screen=pros', count: 4 }
		]}
	/>
{/snippet}
{#snippet proToolbar()}
	<div class="flex flex-col gap-3">
		<ListSearch applied="" label="Search professionals" placeholder="Search name, email, cell, address…" onSearch={() => {}} />
		<FilterBar
			dimensions={[
				{ key: 'discipline', label: 'Discipline', options: fx.proFacets.disciplines, selected: ['d1'] },
				{ key: 'city', label: 'City', options: fx.proFacets.cities, selected: [] },
				{ key: 'state', label: 'State', options: fx.proFacets.states, selected: [] },
				{ key: 'zip', label: 'Zip', options: fx.proFacets.zipcodes, selected: [] }
			]}
			searchTerm={null}
		/>
	</div>
{/snippet}
{#snippet staffTabs()}
	<TabsWithCounts
		label="Staff role"
		active="all"
		tabs={[
			{ value: 'all', label: 'All staff', href: '?screen=staff', count: 3 },
			{ value: 'admin', label: 'Admins', href: '?screen=staff', count: 1 },
			{ value: 'manager', label: 'Managers', href: '?screen=staff', count: 1 },
			{ value: 'employee', label: 'Employees', href: '?screen=staff', count: 1 }
		]}
	/>
{/snippet}
{#snippet proEmpty()}
	<EmptyState icon={Users} title="No matches" description="No active professionals match these filters.">
		<Button variant="outline">Clear filters</Button>
	</EmptyState>
{/snippet}

<AdminShell pathname={path} nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	{#if screen === 'pros'}
		<Page>
			<PageHeader title="Professionals" description="Every professional member, by status.">
				{#snippet actions()}
					<Button class="gap-2" on:click={() => (addOpen = true)}><Plus class="size-4" />Add professional</Button>
				{/snippet}
			</PageHeader>
			<ProfessionalsTable
				rows={empty ? [] : fx.professionals}
				sort={{ column: 'name', direction: 'asc' }}
				sortHref={(c) => `?screen=pros&sort=${c}`}
				highlightDisciplineIds={['d1']}
				tabs={proTabs}
				toolbar={proToolbar}
				empty={proEmpty}
			/>
		</Page>
		<AddPersonDialog
			bind:open={addOpen}
			form={fx.fakeSuperValidated({ firstName: '', lastName: '', email: '', password: '', companyName: '' })}
			action="#"
			title="Add a professional"
			description="Creates their account with an empty profile. Fill in the rest on the next page."
		/>
	{:else if screen === 'pro'}
		<ProfessionalDetailPage data={fx.professionalData({ admin: q.get('role') !== 'client', empty })} />
	{:else if screen === 'plocation'}
		<PracticeLocationPage data={fx.practiceLocationData() as any} />
	{:else if screen === 'location'}
		<AdminLocationPage data={fx.locationData({ noCoords: q.get('coords') === '0' }) as any} />
	{:else if screen === 'client'}
		<ClientDetailPage data={fx.clientData({ empty, paper: q.get('paper') === '1' })} />
	{:else if screen === 'clients'}
		<Page>
			<PageHeader title="Clients" description="Practices and their owners, by status.">
				{#snippet actions()}<Button class="gap-2"><Plus class="size-4" />Add client</Button>{/snippet}
			</PageHeader>
			<ClientsTable rows={empty ? [] : fx.clients} sortHref={(c) => `?screen=clients&sort=${c}`} highlightCities={['Tampa']} tabs={proTabs} toolbar={proToolbar} empty={proEmpty} />
		</Page>
	{:else if screen === 'staff'}
		<Page>
			<PageHeader title="Staff" description="Your team members and their roles.">
				{#snippet actions()}<Button class="gap-2"><Plus class="size-4" />Add staff to location</Button>{/snippet}
			</PageHeader>
			<StaffTable rows={empty ? [] : fx.staff} sortHref={(c) => `?screen=staff&sort=${c}`} onOpen={(r) => { staffMember = r; staffOpen = true; }} tabs={staffTabs} empty={proEmpty} />
			<PendingInvitesTable invites={fx.pendingInvites} resendAction="#" revokeAction="#" />
		</Page>
		<StaffDetailsDialog bind:open={staffOpen} member={staffMember} />
	{:else if screen === 'locations'}
		<Page>
			<PageHeader title="Locations" description="Your offices. Each one has its own hours, staff and parking notes.">
				{#snippet actions()}<Button class="gap-2"><Plus class="size-4" />Add location</Button>{/snippet}
			</PageHeader>
			<LocationsTable
				rows={empty ? [] : fx.locations}
				hrefFor={(r) => `/locations/${r.id}`}
				sort={{ column: 'location_name', direction: 'asc' }}
				sortHref={(c) => `?screen=locations&sortOn=${c}`}
				pagination={{ page: 1, pageSize: 10, total: 12, href: (p) => `?screen=locations&skip=${(p - 1) * 10}` }}
				empty={proEmpty}
			/>
		</Page>
	{/if}
</AdminShell>
