<!--
  Dev-only fixtures for the "Add days" sheet and the new-request sheet.
  ?role=admin|practice · ?blocked=1 (Add days disabled with a reason)
  The API calls the forms make are answered with fixtures here, so no data is read.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import RecurrenceDaysSheet from '$features/requisitions/components/RecurrenceDaysSheet.svelte';
	import AddRequisitionDrawer from '$lib/components/drawers/addRequisitionDrawer.svelte';
	import { Button } from '$lib/components/ui/button';

	const q = $derived($page.url.searchParams);
	const admin = $derived(q.get('role') !== 'practice');
	const blocked = $derived(q.get('blocked') === '1');

	const sv = (id: string, data: Record<string, unknown>) => ({
		id,
		valid: false,
		posted: false,
		data,
		errors: {},
		constraints: {}
	});

	const dayForm = sv('days', { recurrenceDays: '' });
	const requestData = {
		clientId: '',
		locationId: '',
		disciplineId: '',
		experienceLevelId: '',
		permanentPosition: false,
		hourlyRate: undefined,
		purchaseOrderNumber: '',
		jobDescription: '',
		specialInstructions: '',
		timezone: '',
		title: ''
	};
	const adminForm = sv('admin-req', requestData) as any;
	const clientForm = sv('client-req', requestData) as any;

	const requisition = { id: 1042, referenceTimezone: 'America/New_York' };
	const location = {
		id: 'l1',
		name: 'Bright Smiles Tampa',
		timezone: 'America/New_York',
		// Closed Sundays: picking a week leaves Sunday out.
		operatingHours: { 0: { isClosed: true }, 6: { isClosed: false } }
	};
	const qualified = [
		{ candidateId: 'c1', firstName: 'Maria', lastName: 'Lopez', distance: '3.4', disciplineAbbr: 'RDH' },
		{ candidateId: 'c2', firstName: 'Priya', lastName: 'Shah', distance: '7.9', disciplineAbbr: 'RDH' },
		{ candidateId: 'c3', firstName: 'Dana', lastName: 'Ortiz', distance: '12.0', disciplineAbbr: 'RDH' }
	];

	// Answer the forms' lookups with fixtures (dev preview only).
	if (browser) {
		const fixtures: Record<string, unknown> = {
			'/api/locations/getCompanyLocations': [
				{ id: 'l1', name: 'Bright Smiles Tampa', timezone: 'America/New_York' },
				{ id: 'l2', name: 'Bright Smiles St. Pete', timezone: 'America/New_York' }
			],
			'/api/admin/fetchCompanyLocations': [{ id: 'l1', name: 'Bright Smiles Tampa', timezone: 'America/New_York' }],
			'/api/admin/fetchAllClients': [
				{ company: { id: 'co1', companyName: 'Bright Smiles Dental' }, user: { firstName: 'Ana', lastName: 'Reyes' } },
				{ company: { id: 'co2', companyName: 'Harbor Dental Group' }, user: { firstName: 'Sam', lastName: 'Lee' } }
			],
			'/api/disciplines/fetchAllDisciplines': [
				{ id: 'd1', name: 'Dental Hygienist' },
				{ id: 'd2', name: 'Dental Assistant' },
				{ id: 'd3', name: 'Front Office' }
			],
			'/api/experience/fetchAllExperienceLevels': [
				{ id: 'e1', value: '1+ years', order: 1 },
				{ id: 'e2', value: '3+ years', order: 2 }
			]
		};
		const realFetch = window.fetch.bind(window);
		window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
			const hit = Object.keys(fixtures).find((k) => url.pathname === k);
			if (hit) return Promise.resolve(new Response(JSON.stringify(fixtures[hit]), { headers: { 'content-type': 'application/json' } }));
			if (url.pathname.startsWith('/api/skills')) return Promise.resolve(new Response('[]', { headers: { 'content-type': 'application/json' } }));
			return realFetch(input, init);
		};
	}

	let sidebar = $state<'expanded' | 'rail'>('expanded');
	let requestOpen = $state(false);
</script>

<AdminShell pathname="/requisitions/1042" nav={{ role: admin ? 'SUPERADMIN' : 'CLIENT' }} bind:sidebar name="Shannon Carter" initials="SC">
	<Page>
		<PageHeader title="Sheets preview" description="Add days (dates → times → review) and the new-request sheet.">
			{#snippet actions()}
				<Button variant="outline" on:click={() => (requestOpen = true)}>{admin ? 'New requisition' : 'New request'}</Button>
			{/snippet}
		</PageHeader>
		<Section title="Schedule" description="The Add days trigger as it sits on a temp request.">
			{#snippet actions()}
				<RecurrenceDaysSheet
					{requisition}
					company={{ companyName: 'Bright Smiles Dental' }}
					{location}
					form={dayForm}
					isAdmin={admin}
					qualifiedProfessionals={qualified}
					blockedReason={blocked ? "Bright Smiles Dental can't be invoiced yet: add a card or bank account in billing settings first." : null}
				/>
			{/snippet}
			<p class="text-sm text-muted-foreground">Days would be listed here.</p>
		</Section>
	</Page>
</AdminShell>

<AddRequisitionDrawer
	user={{ role: admin ? 'SUPERADMIN' : 'CLIENT' }}
	bind:drawerExpanded={requestOpen}
	{adminForm}
	{clientForm}
/>
