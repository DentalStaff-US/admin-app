<script lang="ts">
	// Pending invites list — used on the admin client detail page, the client
	// settings staff tab, and the location detail page. Renders one row per
	// not-yet-accepted invite with email/role/location/sent/expires, plus
	// Resend and Revoke action buttons that POST to the supplied actions.
	//
	// `showLocation` is opt-out so the location detail page (which is already
	// scoped to one location) can drop the redundant column.
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { RefreshCw, X } from 'lucide-svelte';
	import { format, formatDistanceToNow } from 'date-fns';

	type Invite = {
		id: string;
		email: string;
		staffRole: string | null;
		invitedRole: string;
		createdAt: Date | string;
		expiresAt: Date | string;
		locationName?: string | null;
	};

	export let invites: Invite[] = [];
	export let resendAction: string;
	export let revokeAction: string;
	export let showLocation = true;
	export let canManage = true;

	function isExpired(expiresAt: Date | string): boolean {
		return new Date(expiresAt).getTime() <= Date.now();
	}

	function staffRoleLabel(role: string | null): string {
		switch (role) {
			case 'CLIENT_ADMIN':
				return 'Admin';
			case 'CLIENT_MANAGER':
				return 'Manager';
			case 'CLIENT_EMPLOYEE':
				return 'Employee';
			default:
				return role ?? '—';
		}
	}
</script>

{#if invites.length > 0}
	<div class="rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-gray-50 text-left text-xs uppercase text-muted-foreground">
				<tr>
					<th class="px-3 py-2 font-medium">Email</th>
					<th class="px-3 py-2 font-medium">Role</th>
					{#if showLocation}
						<th class="px-3 py-2 font-medium">Location</th>
					{/if}
					<th class="px-3 py-2 font-medium">Sent</th>
					<th class="px-3 py-2 font-medium">Status</th>
					{#if canManage}
						<th class="px-3 py-2 font-medium text-right">Actions</th>
					{/if}
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each invites as invite}
					{@const expired = isExpired(invite.expiresAt)}
					<tr>
						<td class="px-3 py-2">{invite.email}</td>
						<td class="px-3 py-2">{staffRoleLabel(invite.staffRole)}</td>
						{#if showLocation}
							<td class="px-3 py-2">{invite.locationName ?? '—'}</td>
						{/if}
						<td class="px-3 py-2 text-muted-foreground">
							{formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
						</td>
						<td class="px-3 py-2">
							{#if expired}
								<Badge value="Expired" class="bg-red-100 text-red-800 text-xs" />
							{:else}
								<Badge value="Pending" class="bg-yellow-100 text-yellow-800 text-xs" />
								<div class="text-xs text-muted-foreground mt-1">
									Expires {format(new Date(invite.expiresAt), 'PP')}
								</div>
							{/if}
						</td>
						{#if canManage}
							<td class="px-3 py-2 text-right">
								<div class="flex justify-end gap-1">
									<form method="POST" action={resendAction} use:enhance>
										<input type="hidden" name="inviteId" value={invite.id} />
										<Button
											type="submit"
											variant="ghost"
											size="icon"
											class="h-8 w-8"
											title="Resend invite email"
										>
											<RefreshCw class="h-4 w-4" />
										</Button>
									</form>
									<form method="POST" action={revokeAction} use:enhance>
										<input type="hidden" name="inviteId" value={invite.id} />
										<Button
											type="submit"
											variant="ghost"
											size="icon"
											class="h-8 w-8 text-red-500"
											title="Revoke invite"
										>
											<X class="h-4 w-4" />
										</Button>
									</form>
								</div>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="text-sm text-muted-foreground py-4">No pending invites.</p>
{/if}
