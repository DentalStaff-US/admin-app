<script lang="ts">
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import FormSheet from '$dtss/FormSheet.svelte';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import type { AddressResult } from '$lib/types';
	import {
		updateCandidateProfileSchema,
		type UpdateCandidateProfileSchema
	} from '$lib/config/zod-schemas';
	import FormPhoneInput from '../FormPhoneInput.svelte';
	import { WORK_PREFERENCE_CHOICES } from '../../people';

	type Candidate = {
		user: { firstName: string | null; lastName: string | null; email: string | null };
		profile: {
			cellPhone: string | null;
			completeAddress: string | null;
			birthday: string | null;
			workersCompCode: string | null;
			workPreference: string | null;
		};
	};

	/**
	 * "Edit" for a professional's personal details: a long form, so a FormSheet
	 * (03 › Which overlay), posting to the existing `updatePersonalDetails`
	 * action. The loader's form is empty, so it's seeded here from the record.
	 */
	let {
		open = $bindable(false),
		form,
		candidate,
		action = '?/updatePersonalDetails'
	}: {
		open?: boolean;
		form: SuperValidated<UpdateCandidateProfileSchema>;
		candidate: Candidate;
		action?: string;
	} = $props();

	// Intentionally NOT prefilled from the profile: the autocomplete's internal
	// `$: if (selected) query = …` fights typing when `selected` starts non-null.
	// The server skips the address when completeAddress is blank, so saving
	// without picking one keeps the address on file.
	let selectedAddress = $state<AddressResult | null>(null);

	function seed() {
		return {
			firstName: candidate.user.firstName ?? '',
			lastName: candidate.user.lastName ?? '',
			email: candidate.user.email ?? '',
			cellPhone: candidate.profile.cellPhone ?? '',
			birthday: candidate.profile.birthday ?? '',
			workersCompCode: candidate.profile.workersCompCode ?? '',
			// NULL means never answered, which the server already treats as both.
			workPreference: (candidate.profile.workPreference ?? 'BOTH') as 'BOTH' | 'TEMP' | 'PERMANENT'
		};
	}

	// svelte-ignore state_referenced_locally
	const sf = superForm(
		{ ...form, id: 'professional-details', data: { ...form.data, ...seed() } },
		{
			id: 'professional-details',
			taintedMessage: null,
			resetForm: false,
			onResult: ({ result }) => {
				if (result.type === 'success') {
					open = false;
					selectedAddress = null;
				}
			}
		}
	);
	const { submitting, tainted, errors, form: values } = sf;
	const config = { form: sf, schema: updateCandidateProfileSchema };

	// Re-seed from the record each time the sheet opens, so Cancel really discards.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			values.set({ ...$values, ...seed() });
			tainted.set(undefined);
			selectedAddress = null;
		}
		wasOpen = open;
	});

	const dirty = $derived(Boolean($tainted) || selectedAddress !== null);
	const street = $derived(
		[selectedAddress?.address_components?.street_number, selectedAddress?.address_components?.street_name]
			.filter(Boolean)
			.join(' ')
	);
</script>

<FormSheet bind:open title="Edit personal details" description="Contact details, address and what work they're shown." {dirty}>
	<Form.Root form={sf} controlled schema={updateCandidateProfileSchema} {action} id="professional-details-form" class="space-y-5">
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
				<Form.Description>Also their sign-in.</Form.Description>
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<Form.Field {config} name="cellPhone">
			<Form.Item>
				<Form.Label>Cell phone</Form.Label>
				<FormPhoneInput />
				<Form.Validation />
			</Form.Item>
		</Form.Field>

		<div class="space-y-2">
			<Label for="professional-address">Address</Label>
			<p class="text-sm text-muted-foreground">
				{#if candidate.profile.completeAddress}
					On file: <span class="text-foreground">{candidate.profile.completeAddress}</span>. Search only to change it.
				{:else}
					No address on file.
				{/if}
			</p>
			<AddressSearchAutocomplete
				bind:selected={selectedAddress}
				on:clear={() => (selectedAddress = null)}
				placeholder={candidate.profile.completeAddress ? 'Start typing to change address…' : 'Search for an address…'}
				country="us"
				maxResults={8}
			/>
			<input type="hidden" name="completeAddress" value={selectedAddress?.formatted_address || ''} />
			<input type="hidden" name="lat" value={selectedAddress?.coordinates.lat || ''} />
			<input type="hidden" name="lon" value={selectedAddress?.coordinates.lng || ''} />
			<!-- Granular components so the address stays filterable. -->
			<input type="hidden" name="address" value={street} />
			<input type="hidden" name="city" value={selectedAddress?.context?.place || selectedAddress?.context?.locality || ''} />
			<input type="hidden" name="state" value={selectedAddress?.context?.region_code || selectedAddress?.context?.region || ''} />
			<input type="hidden" name="zipcode" value={selectedAddress?.context?.postcode || ''} />
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<Form.Field {config} name="birthday">
				<Form.Item>
					<Form.Label>Date of birth</Form.Label>
					<Form.Input type="date" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<Form.Field {config} name="workersCompCode">
				<Form.Item>
					<Form.Label>Workers' comp code</Form.Label>
					<Form.Input placeholder="e.g. 8021" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
		</div>

		<Form.Field {config} name="workPreference">
			<Form.Item>
				<Form.Label>Looking for</Form.Label>
				<Form.RadioGroup class="gap-2">
					{#each WORK_PREFERENCE_CHOICES as choice (choice.value)}
						<div class="flex items-center gap-2">
							<Form.RadioItem value={choice.value} id="wp-{choice.value}" />
							<Label for="wp-{choice.value}" class="font-normal">{choice.label}</Label>
						</div>
					{/each}
				</Form.RadioGroup>
				<Form.Description>Controls which jobs they see and are texted about. Both is the default.</Form.Description>
				<Form.Validation />
			</Form.Item>
		</Form.Field>

		{#if $errors._errors?.length}<p class="text-sm text-destructive" role="alert">{$errors._errors[0]}</p>{/if}
	</Form.Root>

	{#snippet footer()}
		<Button variant="outline" on:click={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="professional-details-form" disabled={$submitting}>
			{$submitting ? 'Saving…' : 'Save changes'}
		</Button>
	{/snippet}
</FormSheet>
