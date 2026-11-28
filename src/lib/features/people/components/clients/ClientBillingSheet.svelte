<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Notice from '$dtss/Notice.svelte';
	import { updateClientSchema } from '$lib/config/zod-schemas';

	const METHODS = [
		{ value: 'STRIPE', label: 'Electronic (Stripe)' },
		{ value: 'PAPER', label: 'Paper invoice' }
	];

	/**
	 * Billing contact, remit-to address and invoicing method. These are
	 * company attributes (client_companies), apart from the invoice method on
	 * the profile; the existing `updateClient` action writes only the fields
	 * this sheet posts, then re-syncs the Stripe customer's billing email.
	 */
	let {
		open = $bindable(false),
		form,
		accountEmail,
		hasStripeCustomer = false,
		action = '?/updateClient'
	}: {
		open?: boolean;
		form: SuperValidated<any>;
		accountEmail: string;
		hasStripeCustomer?: boolean;
		action?: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	const sf = superForm(
		{ ...form, id: 'client-billing' },
		{
			id: 'client-billing',
			taintedMessage: null,
			resetForm: false,
			onResult: ({ result }) => {
				if (result.type === 'success') open = false;
			}
		}
	);
	const { submitting, tainted, errors, form: values } = sf;
	const config = { form: sf, schema: updateClientSchema };

	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			values.set({ ...form.data });
			tainted.set(undefined);
		}
		wasOpen = open;
	});

	const method = $derived(METHODS.find((m) => m.value === $values.invoiceMethod) ?? METHODS[0]);
</script>

<FormSheet bind:open title="Edit billing" description="Where invoices go and how they're sent." dirty={Boolean($tainted)}>
	<Form.Root form={sf} controlled schema={updateClientSchema} {action} id="client-billing-form" class="space-y-5">
		<Form.Field {config} name="billingContactName">
			<Form.Item>
				<Form.Label>Billing contact</Form.Label>
				<Form.Input placeholder="e.g. Accounts Payable" />
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<Form.Field {config} name="billingEmail">
			<Form.Item>
				<Form.Label>Billing email</Form.Label>
				<Form.Input type="email" placeholder={accountEmail} />
				<Form.Description>Invoices and billing notices go here. Leave blank to use the owner's email ({accountEmail}).</Form.Description>
				<Form.Validation />
			</Form.Item>
		</Form.Field>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold">Billing address</legend>
			<p class="-mt-2 text-sm text-muted-foreground">Printed on invoices. Blank falls back to the primary office.</p>
			<Form.Field {config} name="billingStreetOne">
				<Form.Item>
					<Form.Label>Street address</Form.Label>
					<Form.Input autocomplete="address-line1" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<Form.Field {config} name="billingStreetTwo">
				<Form.Item>
					<Form.Label>Suite / unit</Form.Label>
					<Form.Input autocomplete="address-line2" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<div class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
				<Form.Field {config} name="billingCity">
					<Form.Item>
						<Form.Label>City</Form.Label>
						<Form.Input autocomplete="address-level2" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field {config} name="billingState">
					<Form.Item>
						<Form.Label>State</Form.Label>
						<Form.Input maxlength={2} autocomplete="address-level1" class="uppercase" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field {config} name="billingZipcode">
					<Form.Item>
						<Form.Label>ZIP</Form.Label>
						<Form.Input inputmode="numeric" autocomplete="postal-code" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
			</div>
		</fieldset>

		<Form.Field {config} name="invoiceMethod">
			<Form.Item>
				<Form.Label>Invoicing method</Form.Label>
				<Form.Select selected={{ value: method.value, label: method.label }}>
					<Form.SelectTrigger placeholder="Choose a method" />
					<Form.SelectContent>
						{#each METHODS as m (m.value)}<Form.SelectItem value={m.value}>{m.label}</Form.SelectItem>{/each}
					</Form.SelectContent>
				</Form.Select>
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		{#if $values.invoiceMethod === 'PAPER'}
			<!-- client_invoice_method = PAPER overrides a live Stripe customer everywhere,
			     approved timesheets included. Say so where it's set. -->
			<Notice tone={hasStripeCustomer ? 'warning' : 'info'} title="Every invoice will be paper">
				Approved timesheets and one-off invoices are created as paper invoices and tracked by hand{hasStripeCustomer ? ', even though this practice has a Stripe customer on file' : ''}. Nothing is charged through Stripe.
			</Notice>
		{/if}
		{#if $errors._errors?.length}<p class="text-sm text-destructive" role="alert">{$errors._errors[0]}</p>{/if}
	</Form.Root>

	{#snippet footer()}
		<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="client-billing-form" disabled={$submitting}>{$submitting ? 'Saving…' : 'Save changes'}</Button>
	{/snippet}
</FormSheet>
