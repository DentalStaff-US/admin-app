<script lang="ts">
	import { Building2 } from 'lucide-svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import AddLocationDrawer from '$lib/components/drawers/addLocationDrawer.svelte';
	import LocationsTable from '../locations/LocationsTable.svelte';
	import type { LocationRow } from '../../lists';

	/** The practice's offices; each row opens the admin location page. */
	let {
		clientId,
		locations,
		company,
		locationForm,
		isAdmin
	}: { clientId: string; locations: any[]; company: any; locationForm: any; isAdmin: boolean } = $props();

	let drawerOpen = $state(false);
	const rows: LocationRow[] = $derived(
		locations.map((l) => ({
			id: l.id,
			location_name: l.name,
			complete_address: l.completeAddress,
			company_phone: l.companyPhone ?? null
		}))
	);
</script>

{#snippet empty()}
	<EmptyState icon={Building2} title="No locations yet" description="Add the practice's first office so requisitions and staff can be tied to it." />
{/snippet}

<Section title="Locations" flush>
	{#snippet actions()}
		{#if isAdmin}<AddLocationDrawer newLocationForm={locationForm} {company} bind:open={drawerOpen} />{/if}
	{/snippet}
	<LocationsTable {rows} hrefFor={(r) => `/clients/${clientId}/locations/${r.id}`} caption="Practice locations" {empty} class="rounded-none border-0 shadow-none" />
</Section>
