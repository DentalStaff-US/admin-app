<script lang="ts">
	import type { Snippet } from 'svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import type { DataColumn, SortState } from '$dtss/tableState';
	import LocationCell from '$lib/components/tables/LocationCell.svelte';
	import type { ClientRow } from '../../lists';
	import PersonAvatar from '../PersonAvatar.svelte';
	import { profileStatusLabel } from '../../people';

	let {
		rows,
		sort,
		sortHref,
		highlightCities = [],
		highlightStates = [],
		tabs,
		toolbar,
		empty
	}: {
		rows: ClientRow[];
		sort?: SortState;
		sortHref?: (column: string) => string;
		highlightCities?: string[];
		highlightStates?: string[];
		tabs?: Snippet;
		toolbar?: Snippet;
		empty?: Snippet;
	} = $props();

	const practice = (r: ClientRow) => r.company.companyName || 'No company';
	const owner = (r: ClientRow) => `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim();

	const columns: DataColumn<ClientRow>[] = [
		{ id: 'companyName', header: 'Practice', cell: practiceCell, sortable: true },
		{ id: 'name', header: 'Owner', value: owner, sortable: true, class: 'whitespace-nowrap' },
		{ id: 'email', header: 'Email', value: (r) => r.user.email, sortable: true, class: 'max-w-56 truncate' },
		{ id: 'locations', header: 'Locations', cell: locationCell, sortable: true },
		{ id: 'status', header: 'Status', cell: statusCell },
		{ id: 'createdAt', header: 'Created', value: (r) => new Date(r.profile.createdAt).toLocaleDateString(), sortable: true, class: 'whitespace-nowrap tabular-nums' }
	];
</script>

{#snippet practiceCell(r: ClientRow)}
	<span class="inline-flex items-center gap-3">
		<PersonAvatar name={practice(r)} src={r.company.companyLogo} initials={(r.company.companyName?.[0] ?? '?').toUpperCase()} kind="org" />
		<span class="whitespace-nowrap">{practice(r)}</span>
	</span>
{/snippet}

{#snippet locationCell(r: ClientRow)}
	<LocationCell locations={r.locations ?? []} {highlightCities} {highlightStates} />
{/snippet}

{#snippet statusCell(r: ClientRow)}
	<StatusBadge status={r.profile.status ?? 'PENDING'} label={profileStatusLabel(r.profile.status)} />
{/snippet}

{#snippet mobile(r: ClientRow)}
	<div class="flex items-start gap-3">
		<PersonAvatar name={practice(r)} src={r.company.companyLogo} initials={(r.company.companyName?.[0] ?? '?').toUpperCase()} size="md" kind="org" />
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<p class="truncate font-semibold">{practice(r)}</p>
				<StatusBadge status={r.profile.status ?? 'PENDING'} label={profileStatusLabel(r.profile.status)} />
			</div>
			<p class="truncate text-sm text-muted-foreground">{owner(r)} · {r.user.email}</p>
			{#if r.locations?.length}
				<div class="relative z-10 mt-2"><LocationCell locations={r.locations} {highlightCities} {highlightStates} /></div>
			{/if}
		</div>
	</div>
{/snippet}

<DataTable
	{rows}
	{columns}
	key={(r) => r.profile.id}
	rowHref={(r) => `/clients/${r.profile.id}`}
	rowLabel={(r) => `Open ${practice(r)}`}
	caption="Clients"
	{sort}
	{sortHref}
	{tabs}
	{toolbar}
	{empty}
	{mobile}
/>
