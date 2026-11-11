<script lang="ts">
	import { MapPin, UserPlus, Users } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import ImpersonateButton from '$lib/components/admin/ImpersonateButton.svelte';
	import InviteStaffDialog from '$lib/components/dialogs/inviteStaffDialog.svelte';
	import StaffLocationsDialog from '$lib/components/dialogs/staffLocationsDialog.svelte';
	import PendingInvitesTable from '$lib/components/PendingInvitesTable.svelte';
	import StaffDetailsDialog from '../staff/StaffDetailsDialog.svelte';
	import StaffTable from '../staff/StaffTable.svelte';
	import type { StaffRow } from '../../lists';

	/**
	 * The practice's staff (admin view): details, location assignment, sign in
	 * as the staff member, plus invites. The invite and location dialogs are
	 * the shared ones; their actions are unchanged.
	 */
	let {
		staff,
		pendingInvites = [],
		locations,
		companyName,
		isAdmin
	}: {
		staff: any[];
		pendingInvites?: any[];
		locations: { id: string; name: string | null }[];
		companyName: string;
		isAdmin: boolean;
	} = $props();

	let inviteOpen = $state(false);
	let detailsOpen = $state(false);
	let selected = $state<any | null>(null);
	let locationsOpen = $state(false);
	let manage = $state<{ staffId: string; staffName: string; locationIds: string[]; primaryLocationId: string | null } | null>(null);

	function openManage(member: any) {
		const assignments = member.locationAssignments ?? [];
		manage = {
			staffId: member.profile.id,
			staffName: `${member.user.firstName} ${member.user.lastName}`,
			locationIds: assignments.map((a: any) => a.locationId),
			primaryLocationId: assignments.find((a: any) => a.isPrimary)?.locationId ?? null
		};
		locationsOpen = true;
	}
</script>

{#snippet rowActions(row: StaffRow)}
	{@const member = row as any}
	<div class="flex justify-end gap-1">
		<Button variant="ghost" size="icon" class="size-9" aria-label="Manage locations for {member.user.firstName} {member.user.lastName}" on:click={() => openManage(member)}>
			<MapPin class="size-4" aria-hidden="true" />
		</Button>
		{#if isAdmin}
			<!-- Signs in as THIS staff user: their location scope and role apply. -->
			<ImpersonateButton userId={member.user.id} userName="{`${member.user.firstName ?? ''} ${member.user.lastName ?? ''}`.trim()} (staff)" variant="ghost" iconOnly />
		{/if}
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={Users} title="No staff yet" description="Invite the practice's team so they can post requisitions and approve timesheets." />
{/snippet}

<div class="space-y-6">
	<Section title="Staff" flush>
		{#snippet actions()}
			{#if isAdmin}
				{#if locations.length}
					<Button size="sm" class="gap-2" on:click={() => (inviteOpen = true)}><UserPlus class="size-4" aria-hidden="true" />Invite staff</Button>
				{:else}
					<Hint text="Add a location before inviting staff: an invite is tied to a primary location.">
						<Button size="sm" class="gap-2" disabled><UserPlus class="size-4" aria-hidden="true" />Invite staff</Button>
					</Hint>
				{/if}
			{/if}
		{/snippet}
		<StaffTable rows={staff} onOpen={(r) => { selected = r; detailsOpen = true; }} actions={rowActions} {empty} class="rounded-none border-0 shadow-none" />
	</Section>

	{#if isAdmin && pendingInvites.length > 0}
		<Section title="Pending invites" description="Invites expire after 7 days." flush>
			<PendingInvitesTable invites={pendingInvites} resendAction="?/resendStaffInvite" revokeAction="?/revokeStaffInvite" embedded />
		</Section>
	{/if}
</div>

<StaffDetailsDialog bind:open={detailsOpen} member={selected} />

{#if isAdmin}
	<InviteStaffDialog
		bind:open={inviteOpen}
		action="?/inviteStaff"
		{locations}
		dialogTitle="Invite staff for {companyName}"
		dialogDescription="An invite email goes out with a sign-up link tied to the primary location you pick. You can add more locations after they accept."
	/>
{/if}
{#if manage}
	<StaffLocationsDialog
		bind:open={locationsOpen}
		action="?/updateStaffLocations"
		staffId={manage.staffId}
		staffName={manage.staffName}
		{locations}
		initialLocationIds={manage.locationIds}
		initialPrimaryLocationId={manage.primaryLocationId}
	/>
{/if}
