<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import InviteLocationsPicker from '$features/people/components/staff/InviteLocationsPicker.svelte';
	import InviteesEditor, { type Invitee } from './InviteesEditor.svelte';

	let {
		open = $bindable(false),
		locations,
		action = '?/sendClientStaffInvites',
		description = 'Each person gets an email invite to set up their own sign-in for your practice.'
	}: {
		open?: boolean;
		locations: { id: string; name: string | null }[];
		action?: string;
		description?: string;
	} = $props();

	let invitees = $state<Invitee[]>([]);
	let locationsValid = $state(false);
	let submitting = $state(false);
	let error = $state('');

	// A fresh form each time it opens, so a sent or cancelled list doesn't come back.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			invitees = [];
			error = '';
		}
		wasOpen = open;
	});
</script>

<!-- A short, single-purpose form: a Dialog (03 › Which overlay). -->
<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl">
		<form
			method="POST"
			{action}
			class="space-y-6"
			use:enhance={({ formData }) => {
				formData.set('invitees', JSON.stringify(invitees));
				submitting = true;
				error = '';
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'failure') {
						error = (result.data?.inviteError as string) ?? 'The invitations could not be sent. Please try again.';
						return;
					}
					// Back to the list, where the new invites show as pending.
					if (result.type === 'success') open = false;
					await update();
				};
			}}
		>
			<Dialog.Header>
				<Dialog.Title class="text-h2">Invite staff</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<InviteesEditor bind:invitees />
			<InviteLocationsPicker {locations} bind:valid={locationsValid} />
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={submitting || !invitees.length || !locationsValid}>
					{#if submitting}
						<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Sending…
					{:else}
						Send {invitees.length > 1 ? `${invitees.length} invites` : 'invite'}
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
