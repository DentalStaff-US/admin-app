<script lang="ts">
	// Reusable "invite staff" modal. Used today by:
	//   - admin client detail page (admin invites on behalf of a client)
	//   - could be reused by the client settings staff tab later
	//
	// Builds a local list of invitees client-side, then POSTs the whole list
	// to the supplied form action. The server action is responsible for
	// reading the JSON `invitees` and the chosen `locationId`.
	//
	// `locations` is the set of locations the inviter can pick from. We pre-
	// select the first one if none provided.
	import { CLIENT_STAFF_ROLES } from '$lib/config/constants';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select } from 'flowbite-svelte';
	import { Loader2, TrashIcon } from 'lucide-svelte';
	import { enhance } from '$app/forms';

	export let open = false;
	export let action: string;
	export let locations: Array<{ id: string; name: string | null }> = [];
	export let initialLocationId: string | null = null;
	export let dialogTitle = 'Invite Staff';
	export let dialogDescription =
		'Pick a primary location for the invite. You can assign more locations after they sign up.';

	type Invitee = {
		email: string;
		staffRole: keyof typeof CLIENT_STAFF_ROLES;
	};

	const StaffRoleMap = [
		{ name: 'Admin', value: CLIENT_STAFF_ROLES.CLIENT_ADMIN },
		{ name: 'Manager', value: CLIENT_STAFF_ROLES.CLIENT_MANAGER },
		{ name: 'Employee', value: CLIENT_STAFF_ROLES.CLIENT_EMPLOYEE }
	];

	let invitees: Invitee[] = [];
	let inviteEmail = '';
	let inviteRole: keyof typeof CLIENT_STAFF_ROLES | '' = '';
	let selectedLocationId: string = initialLocationId ?? locations[0]?.id ?? '';
	let submitting = false;

	// If the parent updates `initialLocationId` after mount (e.g. a load
	// fetches locations async), reflect that selection when we have no
	// user choice yet.
	$: if (!selectedLocationId && (initialLocationId || locations[0]?.id)) {
		selectedLocationId = initialLocationId ?? locations[0]?.id ?? '';
	}

	function isValidEmail(email: string) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	function handleAdd() {
		if (!inviteEmail || !inviteRole) return;
		if (!isValidEmail(inviteEmail)) return;
		if (invitees.some((i) => i.email === inviteEmail)) return;
		invitees = [
			{ email: inviteEmail, staffRole: inviteRole as keyof typeof CLIENT_STAFF_ROLES },
			...invitees
		];
		inviteEmail = '';
		inviteRole = '';
	}

	function handleRemove(email: string) {
		invitees = invitees.filter((i) => i.email !== email);
	}

	function handleSelectRowRole(email: string, role: string) {
		const idx = invitees.findIndex((i) => i.email === email);
		if (idx === -1) return;
		invitees[idx] = {
			...invitees[idx],
			staffRole: role as keyof typeof CLIENT_STAFF_ROLES
		};
		invitees = [...invitees];
	}

	function onRoleChange(email: string, ev: Event) {
		const target = ev.target as HTMLSelectElement | null;
		handleSelectRowRole(email, target?.value ?? '');
	}

	function reset() {
		invitees = [];
		inviteEmail = '';
		inviteRole = '';
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[640px] max-h-screen overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{dialogTitle}</Dialog.Title>
			<Dialog.Description>{dialogDescription}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			{action}
			use:enhance={({ formData }) => {
				submitting = true;
				formData.set('invitees', JSON.stringify(invitees));
				formData.set('locationId', selectedLocationId);
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success') {
						reset();
						open = false;
					}
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label>Primary location</Label>
				<Select bind:value={selectedLocationId} placeholder="Select a location">
					{#each locations as loc}
						<option value={loc.id}>{loc.name ?? 'Unnamed location'}</option>
					{/each}
				</Select>
			</div>

			<div class="grid grid-cols-12 gap-2 items-end">
				<div class="col-span-12 md:col-span-6 space-y-2">
					<Label>Email</Label>
					<Input bind:value={inviteEmail} placeholder="staff@example.com" />
				</div>
				<div class="col-span-12 md:col-span-4 space-y-2">
					<Label>Role</Label>
					<Select bind:value={inviteRole} placeholder="Select role">
						{#each StaffRoleMap as role}
							<option value={role.value}>{role.name}</option>
						{/each}
					</Select>
				</div>
				<Button
					type="button"
					class="col-span-12 md:col-span-2 bg-primary hover:bg-primary/90"
					disabled={!inviteEmail || !inviteRole || !isValidEmail(inviteEmail)}
					on:click={handleAdd}
				>
					Add
				</Button>
			</div>

			{#if invitees.length > 0}
				<div class="border rounded-md divide-y">
					{#each invitees as invitee}
						<div class="flex items-center justify-between gap-4 px-3 py-2">
							<p class="text-sm">{invitee.email}</p>
							<div class="flex items-center gap-2">
								<Select
									value={invitee.staffRole}
									on:change={(e) => onRoleChange(invitee.email, e)}
								>
									{#each StaffRoleMap as role}
										<option value={role.value}>{role.name}</option>
									{/each}
								</Select>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="h-8 w-8 text-red-500"
									on:click={() => handleRemove(invitee.email)}
								>
									<TrashIcon class="h-4 w-4" />
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">
					Add at least one email + role before sending invites.
				</p>
			{/if}

			<Dialog.Footer>
				<Button type="button" variant="destructiveOutline" on:click={() => (open = false)} disabled={submitting}>
					Cancel
				</Button>
				<Button
					type="submit"
					class="bg-primary hover:bg-primary/90"
					disabled={submitting || invitees.length === 0 || !selectedLocationId}
				>
					{#if submitting}
						<Loader2 class="h-4 w-4 mr-2 animate-spin" />
						Sending…
					{:else}
						Send {invitees.length || ''} invite{invitees.length === 1 ? '' : 's'}
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
