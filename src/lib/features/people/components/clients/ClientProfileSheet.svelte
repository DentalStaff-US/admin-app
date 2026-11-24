<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import FormSheet from '$dtss/FormSheet.svelte';
	import { updateClientSchema } from '$lib/config/zod-schemas';
	import FormPhoneInput from '../FormPhoneInput.svelte';
	import LogoUpload from '../LogoUpload.svelte';

	/**
	 * Owner and practice identity. Posts to the existing `updateClient`
	 * action, which only writes the fields present in the request, so this
	 * sheet sends exactly the profile fields and never touches billing.
	 */
	let {
		open = $bindable(false),
		form,
		logo = null,
		action = '?/updateClient'
	}: { open?: boolean; form: SuperValidated<any>; logo?: string | null; action?: string } = $props();

	// svelte-ignore state_referenced_locally
	const sf = superForm(
		{ ...form, id: 'client-profile' },
		{
			id: 'client-profile',
			taintedMessage: null,
			resetForm: false,
			onResult: ({ result }) => {
				if (result.type === 'success') open = false;
			}
		}
	);
	const { submitting, tainted, errors, form: values } = sf;
	const config = { form: sf, schema: updateClientSchema };

	// Opening re-seeds from what's stored, so Cancel really discards.
	let editedLogo = $state<string | null>(null);
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			values.set({ ...form.data });
			tainted.set(undefined);
			editedLogo = logo;
		}
		wasOpen = open;
	});
</script>

<FormSheet bind:open title="Edit practice & owner" description="The practice name and the account owner's details." dirty={Boolean($tainted) || editedLogo !== logo}>
	<Form.Root form={sf} controlled schema={updateClientSchema} {action} id="client-profile-form" class="space-y-5">
		<LogoUpload bind:value={editedLogo} saved={logo} name="companyLogo" label="Avatar" initials={($values.companyName?.[0] ?? '?').toUpperCase()} />
		<Form.Field {config} name="companyName">
			<Form.Item>
				<Form.Label>Practice name</Form.Label>
				<Form.Input autocomplete="organization" />
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field {config} name="firstName">
				<Form.Item>
					<Form.Label>Owner first name</Form.Label>
					<Form.Input autocomplete="off" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<Form.Field {config} name="lastName">
				<Form.Item>
					<Form.Label>Owner last name</Form.Label>
					<Form.Input autocomplete="off" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
		</div>
		<Form.Field {config} name="email">
			<Form.Item>
				<Form.Label>Owner email</Form.Label>
				<Form.Input type="email" autocomplete="off" />
				<Form.Description>Their sign-in. Invoices go to the billing email instead, when one is set.</Form.Description>
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<Form.Field {config} name="cellPhone">
			<Form.Item>
				<Form.Label>Owner cell phone</Form.Label>
				<FormPhoneInput />
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field {config} name="baseLocation">
				<Form.Item>
					<Form.Label>Base location</Form.Label>
					<Form.Input placeholder="e.g. Tampa, FL" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<Form.Field {config} name="website">
				<Form.Item>
					<Form.Label>Website</Form.Label>
					<Form.Input type="url" placeholder="https://example.com" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
		</div>
		{#if $errors._errors?.length}<p class="text-sm text-destructive" role="alert">{$errors._errors[0]}</p>{/if}
	</Form.Root>

	{#snippet footer()}
		<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="client-profile-form" disabled={$submitting}>{$submitting ? 'Saving…' : 'Save changes'}</Button>
	{/snippet}
</FormSheet>
