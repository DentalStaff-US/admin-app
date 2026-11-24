<script lang="ts">
	import { enhance } from '$app/forms';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { LocationRow } from '../../lists';

	/**
	 * Quick edit from a locations table: the name and contact details. Address,
	 * timezone and hours stay on the location page. Posts to an
	 * `updateLocationInfo` action (see server/locationInfo.ts).
	 */
	let {
		open = $bindable(false),
		location,
		action = '?/updateLocationInfo',
		href
	}: {
		open?: boolean;
		location: LocationRow | null;
		action?: string;
		/** The location page, for everything this dialog doesn't cover. */
		href?: string;
	} = $props();

	let name = $state('');
	let companyPhone = $state('');
	let cellPhone = $state('');
	let email = $state('');
	let website = $state('');
	let errors = $state<Record<string, string[] | undefined>>({});
	let submitting = $state(false);

	// Opening re-seeds from what's stored, so Cancel really discards.
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen && location) {
			name = location.location_name ?? '';
			companyPhone = location.company_phone ?? '';
			cellPhone = location.cell_phone ?? '';
			email = location.email ?? '';
			website = location.website ?? '';
			errors = {};
		}
		wasOpen = open;
	});
</script>

{#snippet fieldError(field: string)}
	{#if errors[field]?.length}<p id="location-{field}-error" class="text-sm text-destructive">{errors[field]?.[0]}</p>{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Edit location</Dialog.Title>
			<Dialog.Description>
				The name and contact details.
				{#if href}<a {href} class="font-semibold text-primary-dark hover:underline">Open the location</a> to change its address, timezone or hours.{/if}
			</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			{action}
			class="grid gap-4"
			use:enhance={() => {
				submitting = true;
				errors = {};
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'failure') {
						errors = (result.data?.locationErrors as typeof errors) ?? { name: ['The location could not be saved. Try again.'] };
						return;
					}
					if (result.type === 'success') open = false;
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="locationId" value={location?.id ?? ''} />
			<div class="grid gap-2">
				<Label for="location-name">Location name</Label>
				<Input id="location-name" name="name" required maxlength={120} bind:value={name} aria-invalid={errors.name ? 'true' : undefined} aria-describedby={errors.name ? 'location-name-error' : undefined} />
				{@render fieldError('name')}
			</div>
			<div class="grid items-start gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="location-companyPhone">Office phone</Label>
					<PhoneInput id="location-companyPhone" name="companyPhone" bind:value={companyPhone} />
					{@render fieldError('companyPhone')}
				</div>
				<div class="grid gap-2">
					<Label for="location-cellPhone">Office cell</Label>
					<PhoneInput id="location-cellPhone" name="cellPhone" bind:value={cellPhone} />
					{@render fieldError('cellPhone')}
				</div>
			</div>
			<div class="grid gap-2">
				<Label for="location-email">Email</Label>
				<Input id="location-email" name="email" type="email" bind:value={email} placeholder="frontdesk@example.com" />
				{@render fieldError('email')}
			</div>
			<div class="grid gap-2">
				<Label for="location-website">Website</Label>
				<Input id="location-website" name="website" type="url" bind:value={website} placeholder="https://example.com" />
				{@render fieldError('website')}
			</div>
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save changes'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
