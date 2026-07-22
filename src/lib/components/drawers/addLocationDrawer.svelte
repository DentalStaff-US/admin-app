<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '../ui/checkbox';
	import { superForm } from 'sveltekit-superforms/client';
	import { Loader2, PlusIcon } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import type { ClientCompany } from '$lib/server/database/schemas/client';
	import * as Form from '../ui/form';
	import { clientCompanyLocationSchema } from '$lib/config/zod-schemas';
	import { STATES, TIMEZONES } from '$lib/config/constants';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import type { AddressResult } from '$lib/types';

	export let newLocationForm;
	export let open: boolean;
	export let company: ClientCompany | undefined;

	let selectedTimezone = '';

	const form = superForm(newLocationForm);

	const { enhance, form: formData, submitting, errors } = form;

	let selectedAddress: AddressResult | null = null;

	function handleAddressSelect(event: CustomEvent<AddressResult>) {
		const address = event.detail;
		console.log('Selected address:', address);
		selectedAddress = address;
	}

	function handleClear() {
		console.log('Address cleared');
		selectedAddress = null;
	}

	$: {
		if (selectedAddress) {
			$formData.lat = selectedAddress.coordinates.lat;
			$formData.lon = selectedAddress.coordinates.lng;
			$formData.completeAddress = selectedAddress.formatted_address;
		}
	}
</script>

<Sheet.Root {open} on:openChange={(e) => (open = !open)}>
	<Sheet.Trigger asChild>
		<Button on:click={() => (open = true)} class="bg-primary hover:bg-primary/90 mb-4">
			<PlusIcon size={20} class="mr-2" />
			New Location
		</Button>
	</Sheet.Trigger>
	<Sheet.Content side="right" class="overflow-scroll">
		<form method="POST" action="?/createLocation" use:enhance class="h-full flex flex-col">
			<Sheet.Header>
				<Sheet.Title>Add New Location</Sheet.Title>
				<Sheet.Description>Add details for a location for your business.</Sheet.Description>
			</Sheet.Header>
			<div class="grid gap-4 py-4">
				<div class="space-y-2">
					<div>
						<Label>Location Name</Label>
						<Input name="name" bind:value={$formData.name} />
					</div>
					<div>
						<Label>Address</Label>
						<AddressSearchAutocomplete
							bind:selected={selectedAddress}
							on:select={handleAddressSelect}
							on:clear={handleClear}
							placeholder="Enter your address..."
							country="us"
							maxResults={8}
						/>
					</div>
					<div>
						<Label>Timezone</Label>
						<Select.Root
							preventScroll={false}
							selected={selectedTimezone}
							onSelectedChange={(v) => {
								v && ($formData.timezone = String(v.value));
							}}
						>
							<Select.Trigger>
								<Select.Value />
							</Select.Trigger>
							<Select.Content class="max-h-[150px] overflow-y-scroll">
								{#each TIMEZONES as timezone}
									<Select.Item value={timezone.name}>
										<span>{timezone.label}</span>
									</Select.Item>
								{/each}
							</Select.Content>
							<Input name="timezone" type="hidden" value={$formData.timezone} />
						</Select.Root>
					</div>
					<div>
						<Label>Office Phone Number</Label>
						<PhoneInput name="companyPhone" bind:value={$formData.companyPhone} />
					</div>
					<div>
						<Label>Office Email Address</Label>
						<Input name="email" type="email" bind:value={$formData.email} />
					</div>
					<div>
						<Label>Website</Label>
						<Input
							name="website"
							type="url"
							placeholder="https://example.com"
							bind:value={$formData.website}
						/>
					</div>
				</div>
				<input type="hidden" name="companyId" value={company?.id} />
				<input type="hidden" name="lat" value={$formData.lat} />
				<input type="hidden" name="lon" value={$formData.lon} />
				<input type="hidden" name="completeAddress" value={$formData.completeAddress} />
			</div>
			<Sheet.Footer class="mt-auto">
				<Sheet.Close asChild>
					<Button
						on:click={() => (open = false)}
						class="bg-destructive hover:bg-destructive/90 mb-4"
						type="button"
						>Cancel
					</Button>
				</Sheet.Close>
				<Sheet.Close asChild>
					<Button
						on:click={() => (open = false)}
						class="bg-primary hover:bg-primary/90 mb-4"
						type="submit"
					>
						{#if $submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Please wait...
						{:else}Add Location
						{/if}
					</Button>
				</Sheet.Close>
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>
