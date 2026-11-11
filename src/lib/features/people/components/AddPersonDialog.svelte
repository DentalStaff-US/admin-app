<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import { adminNewUserSchema, type AdminNewUserSchema } from '$lib/config/zod-schemas';

	/**
	 * Short form (≤ 6 fields) → Dialog (03 › Which overlay). Creates the user
	 * and an empty profile through the list page's existing action, which then
	 * redirects to the new record.
	 */
	let {
		open = $bindable(false),
		form,
		action,
		title,
		description,
		withCompany = false
	}: {
		open?: boolean;
		form: SuperValidated<AdminNewUserSchema>;
		action: string;
		title: string;
		description: string;
		withCompany?: boolean;
	} = $props();

	// svelte-ignore state_referenced_locally
	const sf = superForm(form, {
		taintedMessage: null,
		onResult: ({ result }) => {
			if (result.type === 'success' || result.type === 'redirect') open = false;
		}
	});
	const { submitting, message, errors } = sf;
	const config = { form: sf, schema: adminNewUserSchema };
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Form.Root form={sf} controlled schema={adminNewUserSchema} {action} class="space-y-4">
			<div class="grid gap-4 sm:grid-cols-2">
				<Form.Field {config} name="firstName">
					<Form.Item>
						<Form.Label>First name</Form.Label>
						<Form.Input autocomplete="off" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field {config} name="lastName">
					<Form.Item>
						<Form.Label>Last name</Form.Label>
						<Form.Input autocomplete="off" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
			</div>
			<Form.Field {config} name="email">
				<Form.Item>
					<Form.Label>Email</Form.Label>
					<Form.Input type="email" autocomplete="off" />
					<Form.Description>Must not already be in use. It becomes their sign-in.</Form.Description>
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			{#if withCompany}
				<Form.Field {config} name="companyName">
					<Form.Item>
						<Form.Label>Practice name</Form.Label>
						<Form.Input autocomplete="off" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
			{/if}
			<Form.Field {config} name="password">
				<Form.Item>
					<Form.Label>Temporary password</Form.Label>
					<Form.Input type="text" autocomplete="off" />
					<Form.Description>At least 8 characters. Share it securely.</Form.Description>
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			{#if $errors._errors?.length || ($message && $message !== 'Profile created successfully')}
				<p class="text-sm text-destructive" role="alert">{$errors._errors?.[0] ?? $message}</p>
			{/if}
			<Dialog.Footer class="gap-2">
				<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={$submitting}>{$submitting ? 'Creating…' : 'Create'}</Button>
			</Dialog.Footer>
		</Form.Root>
	</Dialog.Content>
</Dialog.Root>
