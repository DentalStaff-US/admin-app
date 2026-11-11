<script lang="ts">
	// Add professional / Add client (short forms → Dialog, 03 › Which overlay).
	// Each dialog has its own superForm (they used to share one, 10 §2.4), Cancel
	// closes this dialog, and the password field is a password field.
	import { superForm } from 'sveltekit-superforms/client';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { AdminNewUserSchema } from '$lib/config/zod-schemas';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		open = $bindable(false),
		kind,
		form: validated
	}: { open?: boolean; kind: 'professional' | 'client'; form: SuperValidated<AdminNewUserSchema> } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, submitting, enhance } = superForm<AdminNewUserSchema>(validated, {
		onResult: ({ result }) => {
			if (result.type === 'success') open = false;
		}
	});

	const action = $derived(kind === 'professional' ? '/professionals?/adminCreateProfessional' : '/clients?/adminCreateClient');
	const id = (field: string) => `${kind}-${field}`;
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg">
		<form use:enhance method="POST" {action} class="space-y-4">
			<Dialog.Header>
				<Dialog.Title>{kind === 'professional' ? 'New professional' : 'New client'}</Dialog.Title>
				<Dialog.Description>
					Creates their account, so the email must not be in use. You'll add the rest of the
					{kind === 'professional' ? 'profile' : 'practice details'} next.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid grid-cols-2 gap-4">
				<div class="col-span-2 space-y-2 sm:col-span-1">
					<Label for={id('firstName')}>First name</Label>
					<Input id={id('firstName')} bind:value={$form.firstName} name="firstName" autocomplete="off" />
					{#if $errors.firstName}<p class="text-xs text-destructive">{$errors.firstName}</p>{/if}
				</div>
				<div class="col-span-2 space-y-2 sm:col-span-1">
					<Label for={id('lastName')}>Last name</Label>
					<Input id={id('lastName')} bind:value={$form.lastName} name="lastName" autocomplete="off" />
					{#if $errors.lastName}<p class="text-xs text-destructive">{$errors.lastName}</p>{/if}
				</div>
				<div class="col-span-2 space-y-2">
					<Label for={id('email')}>Email</Label>
					<Input id={id('email')} bind:value={$form.email} name="email" type="email" autocomplete="off" />
					{#if $errors.email}<p class="text-xs text-destructive">{$errors.email}</p>{/if}
				</div>
				{#if kind === 'client'}
					<div class="col-span-2 space-y-2">
						<Label for={id('companyName')}>Practice name</Label>
						<Input id={id('companyName')} bind:value={$form.companyName} name="companyName" />
						{#if $errors.companyName}<p class="text-xs text-destructive">{$errors.companyName}</p>{/if}
					</div>
				{/if}
				<div class="col-span-2 space-y-2">
					<Label for={id('password')}>Temporary password</Label>
					<Input id={id('password')} bind:value={$form.password} name="password" type="password" autocomplete="new-password" />
					{#if $errors.password}<p class="text-xs text-destructive">{$errors.password}</p>{/if}
				</div>
			</div>
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={$submitting}>{$submitting ? 'Creating…' : 'Create account'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
