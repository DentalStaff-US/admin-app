<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import InviteesEditor from './InviteesEditor.svelte';

	let { open = $bindable(false), staffInviteForm }: { open?: boolean; staffInviteForm: any } = $props();

	let submitting = $state(false);

	// Same submission as before: the invitees go as JSON (the action parses
	// `invitees`) and as indexed hidden fields.
	// svelte-ignore state_referenced_locally
	const { form, enhance } = superForm(staffInviteForm, {
		resetForm: false,
		onSubmit: ({ formData }) => {
			formData.set('invitees', JSON.stringify($form.invitees));
			submitting = true;
			return true;
		},
		onResult: () => {
			submitting = false;
		}
	});

	$effect.pre(() => {
		if (!$form.invitees) $form.invitees = [];
	});
</script>

<!-- A short, single-purpose form: a Dialog (03 › Which overlay). -->
<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg rounded-2xl">
		<form method="POST" action="?/sendClientStaffInvites" use:enhance class="space-y-6">
			<Dialog.Header>
				<Dialog.Title class="text-h2">Invite staff</Dialog.Title>
				<Dialog.Description>
					Each person gets an email invite to set up their own sign-in for your practice.
				</Dialog.Description>
			</Dialog.Header>
			<InviteesEditor bind:invitees={$form.invitees} />
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={submitting || !$form.invitees?.length}>
					{#if submitting}
						<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" /> Sending…
					{:else}
						Send {$form.invitees?.length > 1 ? `${$form.invitees.length} invites` : 'invite'}
					{/if}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
