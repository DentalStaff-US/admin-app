<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import StaffRoleField from './StaffRoleField.svelte';

	// Superforms validation result for { email, role }.
	let { form: formData }: { form: any } = $props();

	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, submitting, errors, enhance } = superForm(formData, {
		onResult: ({ result }) => {
			if (result.type === 'success') open = false;
		}
	});

	// Every invite starts as Admin, the role with fewer powers.
	function start() {
		$form.role = 'ADMIN';
		open = true;
	}
</script>

<Button on:click={start}><Plus class="mr-2 size-4" aria-hidden="true" /> Invite team member</Button>

<!-- Short form: a Dialog (03 › Which overlay). -->
<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Invite a team member</Dialog.Title>
			<Dialog.Description>
				They get an email invitation to join the DTSS team. The link expires in 7 days.
			</Dialog.Description>
		</Dialog.Header>
		<form use:enhance method="POST" class="grid gap-4">
			<div class="grid gap-2">
				<Label for="invite-email">Email</Label>
				<Input id="invite-email" name="email" type="email" autocomplete="off" placeholder="colleague@example.com" bind:value={$form.email} aria-invalid={$errors.email ? 'true' : undefined} />
				{#if $errors.email}<p class="text-sm text-destructive">{$errors.email}</p>{/if}
			</div>
			<StaffRoleField bind:value={$form.role} />
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={$submitting}>{$submitting ? 'Sending…' : 'Send invite'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
