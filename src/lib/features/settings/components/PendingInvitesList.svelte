<script lang="ts">
	import { RefreshCw, X } from 'lucide-svelte';
	import { format, formatDistanceToNow } from 'date-fns';
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import { STAFF_ROLE_ENUM } from '$lib/config/constants';
	import { Button } from '$lib/components/ui/button';

	type Invite = {
		id: string;
		email: string;
		staffRole: string | null;
		createdAt: Date | string;
		expiresAt: Date | string;
		locationName?: string | null;
	};

	// The settings copy of the shared PendingInvitesTable: same actions, plus a
	// confirmation before revoking (03 › Which overlay).
	let {
		invites,
		resendAction = '?/resendStaffInvite',
		revokeAction = '?/revokeStaffInvite'
	}: { invites: Invite[]; resendAction?: string; revokeAction?: string } = $props();

	let revoking = $state<Invite | null>(null);
	let confirmOpen = $state(false);

	const expired = (invite: Invite) => new Date(invite.expiresAt).getTime() <= Date.now();
	const roleLabel = (role: string | null) => (role && role in STAFF_ROLE_ENUM ? STAFF_ROLE_ENUM[role as keyof typeof STAFF_ROLE_ENUM] : (role ?? '—'));

	function askRevoke(invite: Invite) {
		revoking = invite;
		confirmOpen = true;
	}
</script>

<Section title="Pending invites" description="People you've invited who haven't set up their sign-in yet." flush>
	<ul class="divide-y">
		{#each invites as invite (invite.id)}
			<li class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
				<div class="min-w-0">
					<p class="break-all text-sm font-semibold">{invite.email}</p>
					<p class="text-sm text-muted-foreground">
						{roleLabel(invite.staffRole)}{invite.locationName ? ` · ${invite.locationName}` : ''} · sent {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
					</p>
				</div>
				<div class="flex items-center gap-2">
					{#if expired(invite)}
						<StatusBadge status="EXPIRED" />
					{:else}
						<StatusBadge status="PENDING" label={`Expires ${format(new Date(invite.expiresAt), 'MMM d')}`} />
					{/if}
					<form method="POST" action={resendAction} use:enhance>
						<input type="hidden" name="inviteId" value={invite.id} />
						<Button type="submit" variant="ghost" size="icon" aria-label={`Resend the invite to ${invite.email}`}>
							<RefreshCw class="size-4" aria-hidden="true" />
						</Button>
					</form>
					<Button variant="ghost" size="icon" class="text-destructive hover:text-destructive" aria-label={`Revoke the invite to ${invite.email}`} on:click={() => askRevoke(invite)}>
						<X class="size-4" aria-hidden="true" />
					</Button>
				</div>
			</li>
		{/each}
	</ul>
</Section>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Revoke this invite?"
	description={revoking
		? `The link sent to ${revoking.email} stops working and the invite is removed. You can invite them again later.`
		: ''}
	cancelLabel="Keep invite"
>
	{#snippet confirm()}
		<form
			method="POST"
			action={revokeAction}
			use:enhance={() => {
				confirmOpen = false;
				return async ({ update }) => update();
			}}
		>
			<input type="hidden" name="inviteId" value={revoking?.id ?? ''} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10">Revoke invite</Button>
		</form>
	{/snippet}
</ConfirmDialog>
