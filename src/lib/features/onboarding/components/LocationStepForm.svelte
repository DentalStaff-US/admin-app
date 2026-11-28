<script lang="ts">
	// Legacy syntax on purpose: formsnap 0.4's Form.Root hands out its config
	// and state through let: directives.
	import { Loader2 } from 'lucide-svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import Notice from '$dtss/Notice.svelte';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import * as Form from '$lib/components/ui/form';
	import * as Select from '$lib/components/ui/select';
	import { clientCompanyLocationSchema } from '$lib/config/zod-schemas';
	import type { AddressResult } from '$lib/types';
	import StepCard from './StepCard.svelte';

	export let form: SuperValidated<any>;

	const companyLocationSchema = clientCompanyLocationSchema.pick({
		name: true,
		completeAddress: true,
		lat: true,
		lon: true,
		timezone: true,
		phoneNumber: true,
		phoneNumberType: true,
		email: true,
		website: true
	});

	const timezones = Intl.supportedValuesOf('timeZone').filter((z) => z.startsWith('America'));

	let selectedAddress: AddressResult | null = null;
	let selectedTimezone = '';

	function handleAddressSelect(event: CustomEvent<AddressResult>) {
		selectedAddress = event.detail;
	}

	function handleClear() {
		selectedAddress = null;
	}

	// Same display rules as $lib/components/PhoneInput.svelte.
	function maskPhone(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const digits = target.value.replace(/\D/g, '');
		const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
		const trimmed = local.slice(0, 10);
		if (trimmed.length === 0) target.value = '';
		else if (trimmed.length <= 3) target.value = `(${trimmed}`;
		else if (trimmed.length <= 6) target.value = `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
		else target.value = `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6)}`;
	}
</script>

<Form.Root method="POST" {form} schema={companyLocationSchema} let:config let:submitting let:errors>
	<StepCard>
		{#if errors?._errors?.length}
			<Notice tone="negative" alert>{errors._errors.join(' ')}</Notice>
		{/if}
		<Form.Field {config} name="name">
			<Form.Item>
				<Form.Label class="font-semibold">Location name</Form.Label>
				<Form.Input placeholder="e.g. South Tampa" />
				<Form.Validation />
			</Form.Item>
		</Form.Field>

		<div class="space-y-2">
			<span class="block text-sm font-semibold">Address</span>
			<AddressSearchAutocomplete
				bind:selected={selectedAddress}
				on:select={handleAddressSelect}
				on:clear={handleClear}
				placeholder="Start typing the street address"
				country="us"
				maxResults={8}
			/>
		</div>

		<Form.Field {config} name="timezone">
			<Form.Item>
				<Form.Label class="font-semibold">Time zone</Form.Label>
				<Select.Root
					preventScroll={false}
					onSelectedChange={(v) => {
						v && (selectedTimezone = String(v.value));
					}}
				>
					<Select.Trigger>
						<Select.Value placeholder="Choose a time zone" />
					</Select.Trigger>
					<Select.Content class="max-h-60 overflow-y-auto">
						{#each timezones as timezone (timezone)}
							<Select.Item value={timezone} label={timezone}>{timezone}</Select.Item>
						{/each}
					</Select.Content>
					<input name="timezone" type="hidden" value={selectedTimezone} />
				</Select.Root>
				<Form.Description>Shift times are shown in this time zone.</Form.Description>
				<Form.Validation />
			</Form.Item>
		</Form.Field>

		<input type="hidden" name="completeAddress" value={selectedAddress?.formatted_address} />
		<input type="hidden" name="lat" value={selectedAddress?.coordinates.lat} />
		<input type="hidden" name="lon" value={selectedAddress?.coordinates.lng} />

		<div class="grid gap-5 sm:grid-cols-2">
			<Form.Field {config} name="email">
				<Form.Item>
					<Form.Label class="font-semibold">Office email</Form.Label>
					<Form.Input type="email" autocomplete="email" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<Form.Field {config} name="website">
				<Form.Item>
					<Form.Label class="font-semibold">Website</Form.Label>
					<Form.Input type="url" placeholder="https://example.com" />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
		</div>

		<div class="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 sm:gap-5">
			<Form.Field {config} name="phoneNumber">
				<Form.Item>
					<Form.Label class="font-semibold">Phone number</Form.Label>
					<Form.Input type="tel" inputmode="numeric" autocomplete="tel" placeholder="(555) 555-5555" on:input={maskPhone} />
					<Form.Validation />
				</Form.Item>
			</Form.Field>
			<Form.Field {config} name="phoneNumberType">
				<Form.Item>
					<Form.Label class="font-semibold">Type</Form.Label>
					<Form.Select>
						<Form.SelectTrigger placeholder="Type" />
						<Form.SelectContent>
							<Form.SelectItem value={'cell'} label={'Cell'}>Cell</Form.SelectItem>
							<Form.SelectItem value={'office'} label={'Office'}>Office</Form.SelectItem>
						</Form.SelectContent>
					</Form.Select>
					<Form.Validation />
				</Form.Item>
			</Form.Field>
		</div>

		{#snippet footer()}
			<span class="hidden sm:block"></span>
			<Form.Button class="w-full sm:w-auto" disabled={submitting}>
				{#if submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Continue{/if}
			</Form.Button>
		{/snippet}
	</StepCard>
</Form.Root>
