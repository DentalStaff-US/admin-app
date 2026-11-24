<script lang="ts">
	import { MapPin, UserPlus, Users } from 'lucide-svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import StaffLocationsDialog from '$lib/components/dialogs/staffLocationsDialog.svelte';
	import { STAFF_ROLE_ENUM } from '$lib/config/constants';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';
	import { filterStaff, STAFF_FILTERS, staffCounts, type StaffFilter, type StaffMember } from '../team';
	import InviteStaffDialog from './InviteStaffDialog.svelte';
	import PendingInvitesList from './PendingInvitesList.svelte';
	import SettingsPanel from './SettingsPanel.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';

	let {
		staff = [],
		pendingInvites = [],
		companyLocations = [],
		asPage = false
	}: {
		staff?: StaffMember[] | null;
		pendingInvites?: any[];
		companyLocations?: Array<{ id: string; name: string | null }>;
		/** On /team the heading is the page's h1 rather than a settings section h2. */
		asPage?: boolean;
	} = $props();

	const TEAM_DESCRIPTION = 'Who can use DTSS for your practice, and where they work.';
	let filter = $state<StaffFilter>('all');
	let inviteOpen = $state(false);
	let selected = $state<StaffMember | null>(null);
	let detailsOpen = $state(false);
	let locationsOpen = $state(false);
	let locationsFor = $state<{ staffId: string; staffName: string; locationIds: string[]; primaryLocationId: string | null } | null>(null);

	const members = $derived(staff ?? []);
	const counts = $derived(staffCounts(members));
	const rows = $derived(filterStaff(members, filter));

	const fullName = (m: StaffMember) => `${m.user.firstName} ${m.user.lastName}`.trim();
	const initials = (m: StaffMember) => `${m.user.firstName?.[0] ?? ''}${m.user.lastName?.[0] ?? ''}`;
	const roleLabel = (m: StaffMember) => (m.profile.staffRole ? STAFF_ROLE_ENUM[m.profile.staffRole] : '—');
	const locationNames = (m: StaffMember) =>
		(m.locationAssignments ?? []).map((a) => `${a.locationName ?? 'Location'}${a.isPrimary ? ' (primary)' : ''}`).join(', ');

	function view(member: StaffMember) {
		selected = member;
		detailsOpen = true;
	}

	function manageLocations(member: StaffMember) {
		const assignments = member.locationAssignments ?? [];
		locationsFor = {
			staffId: member.profile.id,
			staffName: fullName(member),
			locationIds: assignments.map((a) => a.locationId),
			primaryLocationId: assignments.find((a) => a.isPrimary)?.locationId ?? null
		};
		detailsOpen = false;
		locationsOpen = true;
	}

	const columns: DataColumn<StaffMember>[] = [
		{ id: 'name', header: 'Name', cell: nameCell },
		{ id: 'email', header: 'Email', value: (m) => m.user.email },
		{ id: 'role', header: 'Role', cell: roleCell },
		{ id: 'locations', header: 'Locations', value: (m) => locationNames(m) || '—', class: 'text-muted-foreground' },
		{ id: 'joined', header: 'Joined', value: (m) => new Date(m.profile.createdAt).toLocaleDateString(), numeric: true }
	];
</script>

{#snippet nameCell(m: StaffMember)}
	<button type="button" class="whitespace-nowrap text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onclick={() => view(m)}>
		{fullName(m)}
	</button>
{/snippet}
{#snippet roleCell(m: StaffMember)}<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{roleLabel(m)}</span>{/snippet}
{#snippet mobile(m: StaffMember)}
	<button type="button" class="flex w-full items-center justify-between gap-3 text-left" onclick={() => view(m)}>
		<span class="min-w-0">
			<span class="block truncate font-semibold">{fullName(m)}</span>
			<span class="block truncate text-sm text-muted-foreground">{m.user.email}</span>
		</span>
		<span class="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">{roleLabel(m)}</span>
	</button>
{/snippet}
{#snippet tabs()}
	<div role="tablist" aria-label="Filter by role" class="-mb-px overflow-x-auto">
		<div class="inline-flex h-10 items-center gap-1 rounded-md bg-muted p-1">
			{#each STAFF_FILTERS as option (option.value)}
				{@const current = option.value === filter}
				<button
					type="button"
					role="tab"
					aria-selected={current}
					class={cn(
						'inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-sm px-3 text-sm font-semibold text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
						current && 'bg-background text-foreground shadow-card'
					)}
					onclick={() => (filter = option.value)}
				>
					{option.label}
					<span class={cn('rounded-full px-1.5 text-xs font-bold tabular-nums leading-5 text-muted-foreground', current ? 'bg-muted' : 'bg-background/70')}>
						{counts[option.value]}
					</span>
				</button>
			{/each}
		</div>
	</div>
{/snippet}
{#snippet empty()}
	{#if members.length === 0}
		<EmptyState icon={Users} title="No team members yet" description="Invite the people who post requisitions, approve timesheets or check schedules.">
			<Button on:click={() => (inviteOpen = true)}><UserPlus class="mr-2 size-4" aria-hidden="true" /> Invite staff</Button>
		</EmptyState>
	{:else}
		<p class="py-8 text-center text-sm text-muted-foreground">
			No {STAFF_FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} yet.
			<button type="button" class="font-semibold text-primary-dark hover:underline" onclick={() => (filter = 'all')}>Show everyone</button>
		</p>
	{/if}
{/snippet}

{#snippet inviteButton()}
	<Button on:click={() => (inviteOpen = true)}><UserPlus class="mr-2 size-4" aria-hidden="true" /> Invite staff</Button>
{/snippet}

{#if asPage}
	<PageHeader title="Team" description={TEAM_DESCRIPTION} actions={inviteButton} />
	<div class="space-y-6">
		{#if pendingInvites.length > 0}
			<PendingInvitesList invites={pendingInvites} />
		{/if}

		<DataTable {rows} {columns} key={(m) => m.profile.id} caption="Team members" {tabs} {mobile} {empty} />
	</div>
{:else}
	<SettingsPanel title="Team" description={TEAM_DESCRIPTION} actions={inviteButton}>
		{#if pendingInvites.length > 0}
			<PendingInvitesList invites={pendingInvites} />
		{/if}

		<DataTable {rows} {columns} key={(m) => m.profile.id} caption="Team members" {tabs} {mobile} {empty} />
	</SettingsPanel>
{/if}

<InviteStaffDialog bind:open={inviteOpen} locations={companyLocations} />

<Dialog.Root bind:open={detailsOpen}>
	<Dialog.Content class="max-w-lg rounded-2xl">
		{#if selected}
			<Dialog.Header>
				<div class="flex items-center gap-3">
					<Avatar.Root class="size-12">
						{#if selected.user.avatarUrl}<Avatar.Image src={selected.user.avatarUrl} alt="" />{/if}
						<Avatar.Fallback class="bg-gradient-to-br from-primary to-pro font-bold text-primary-foreground">{initials(selected)}</Avatar.Fallback>
					</Avatar.Root>
					<div class="min-w-0 text-left">
						<Dialog.Title class="text-h2">{fullName(selected)}</Dialog.Title>
						<Dialog.Description class="break-all">{selected.user.email}</Dialog.Description>
					</div>
				</div>
			</Dialog.Header>
			<dl class="divide-y rounded-lg border text-sm">
				<div class="flex justify-between gap-4 px-4 py-3"><dt class="text-muted-foreground">Role</dt><dd class="font-semibold">{roleLabel(selected)}</dd></div>
				<div class="flex justify-between gap-4 px-4 py-3"><dt class="text-muted-foreground">Locations</dt><dd class="text-right font-semibold">{locationNames(selected) || 'None yet'}</dd></div>
				<div class="flex justify-between gap-4 px-4 py-3"><dt class="text-muted-foreground">Birthday</dt><dd class="font-semibold">{selected.profile.birthday || '—'}</dd></div>
				<div class="flex justify-between gap-4 px-4 py-3"><dt class="text-muted-foreground">Joined</dt><dd class="font-semibold tabular-nums">{new Date(selected.profile.createdAt).toLocaleDateString()}</dd></div>
			</dl>
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (detailsOpen = false)}>Close</Button>
				<Button on:click={() => selected && manageLocations(selected)}><MapPin class="mr-2 size-4" aria-hidden="true" /> Manage locations</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

{#if locationsFor}
	<StaffLocationsDialog
		bind:open={locationsOpen}
		action="?/updateStaffLocations"
		staffId={locationsFor.staffId}
		staffName={locationsFor.staffName}
		locations={companyLocations}
		initialLocationIds={locationsFor.locationIds}
		initialPrimaryLocationId={locationsFor.primaryLocationId}
	/>
{/if}
