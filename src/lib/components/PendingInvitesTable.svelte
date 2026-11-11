<script lang="ts">
	// Pending invites list: used on the admin client detail page, the client
	// settings staff tab and the location detail page. One row per
	// not-yet-accepted invite, with Resend and Revoke posting to the supplied
	// actions. Revoke stops the sign-up link working, so it's confirmed.
	//
	// `showLocation` is opt-out so the location detail page (already scoped to
	// one location) can drop the redundant column.
	import { enhance } from '$app/forms';
	import { format, formatDistanceToNow } from 'date-fns';
	import { RefreshCw, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import ConfirmAction from '$lib/features/people/components/ConfirmAction.svelte';
	import { staffRoleLabel } from '$lib/features/people/people';

	type Invite = {
		id: string;
		email: string;
		staffRole: string | null;
		invitedRole: string;
		createdAt: Date | string;
		expiresAt: Date | string;
		locationName?: string | null;
	};

	let {
		invites = [],
		resendAction,
		revokeAction,
		showLocation = true,
		canManage = true
	}: {
		invites: Invite[];
		resendAction: string;
		revokeAction: string;
		showLocation?: boolean;
		canManage?: boolean;
	} = $props();

	const isExpired = (expiresAt: Date | string) => new Date(expiresAt).getTime() <= Date.now();
	let resending = $state<string | null>(null);
</script>

{#if invites.length > 0}
	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full text-sm">
			<caption class="sr-only">Pending invites</caption>
			<thead class="bg-muted/50 text-left">
				<tr>
					<th scope="col" class="px-4 py-3 text-overline font-bold uppercase text-muted-foreground">Email</th>
					<th scope="col" class="hidden px-4 py-3 text-overline font-bold uppercase text-muted-foreground sm:table-cell">Role</th>
					{#if showLocation}
						<th scope="col" class="hidden px-4 py-3 text-overline font-bold uppercase text-muted-foreground md:table-cell">Location</th>
					{/if}
					<th scope="col" class="hidden px-4 py-3 text-overline font-bold uppercase text-muted-foreground sm:table-cell">Sent</th>
					<th scope="col" class="px-4 py-3 text-overline font-bold uppercase text-muted-foreground">Status</th>
					{#if canManage}
						<th scope="col" class="px-4 py-3 text-right"><span class="sr-only">Actions</span></th>
					{/if}
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each invites as invite (invite.id)}
					{@const expired = isExpired(invite.expiresAt)}
					<tr class="align-middle">
						<td class="max-w-40 px-4 py-3 sm:max-w-56">
							<p class="truncate font-semibold">{invite.email}</p>
							<p class="text-caption text-muted-foreground sm:hidden">{staffRoleLabel(invite.staffRole)}</p>
						</td>
						<td class="hidden px-4 py-3 sm:table-cell">{staffRoleLabel(invite.staffRole)}</td>
						{#if showLocation}
							<td class="hidden px-4 py-3 md:table-cell">{invite.locationName ?? '—'}</td>
						{/if}
						<td class="hidden px-4 py-3 text-muted-foreground sm:table-cell">
							{formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
						</td>
						<td class="px-4 py-3">
							{#if expired}
								<StatusBadge status="EXPIRED" />
							{:else}
								<StatusBadge status="PENDING" />
								<p class="mt-1 hidden text-caption text-muted-foreground sm:block">
									Expires {format(new Date(invite.expiresAt), 'PP')}
								</p>
							{/if}
						</td>
						{#if canManage}
							<td class="px-4 py-3">
								<div class="flex justify-end gap-1">
									<form
										method="POST"
										action={resendAction}
										use:enhance={() => {
											resending = invite.id;
											return async ({ update }) => {
												await update();
												resending = null;
											};
										}}
									>
										<input type="hidden" name="inviteId" value={invite.id} />
										<Button
											type="submit"
											variant="ghost"
											size="icon"
											class="size-9"
											aria-label="Resend invite to {invite.email}"
											disabled={resending === invite.id}
										>
											<RefreshCw class="size-4 {resending === invite.id ? 'animate-spin' : ''}" aria-hidden="true" />
										</Button>
									</form>
									<ConfirmAction
										action={revokeAction}
										fields={{ inviteId: invite.id }}
										title="Revoke the invite to {invite.email}?"
										description="The sign-up link in their email stops working. You can invite them again later."
										confirmLabel="Revoke invite"
										label="Revoke invite to {invite.email}"
										icon={X}
										iconOnly
										variant="ghost"
									/>
								</div>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="py-4 text-sm text-muted-foreground">No pending invites.</p>
{/if}
