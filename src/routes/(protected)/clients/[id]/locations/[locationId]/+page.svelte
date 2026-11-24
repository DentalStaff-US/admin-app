<script lang="ts">
	import { getDayName } from '$lib/_helpers';
	import Page from '$dtss/Page.svelte';
	import Section from '$dtss/Section.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Notice from '$dtss/Notice.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ConfirmAction, DetailHeader, PersonAvatar, initialsOf } from '$features/people';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Label } from '$lib/components/ui/label';
	import { format } from 'date-fns';
	import {
		Pencil,
		Plus,
		Phone,
		Mail,
		Globe,
		MapPin,
		Smartphone,
		AlertCircle,
		X,
		Loader2
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { formatTimeForDisplay, formatTimeString } from '$lib/_helpers/UTCTimezoneUtils';
	import * as Select from '$lib/components/ui/select';
	import { TIMEZONES } from '$lib/config/constants';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import type { AddressResult } from '$lib/types.js';
	import { enhance } from '$app/forms';

	export let data;

	$: client = data.client;
	$: location = data.location;
	$: timezoneDriftCount = data.timezoneDrift?.requisitions?.length ?? 0;
	let resyncingTimezones = false;
	$: contactDestinations = data.contactDestinations ?? [];
	$: emailDestinations = contactDestinations.filter((d) => d.type === 'EMAIL');
	$: smsDestinations = contactDestinations.filter((d) => d.type === 'SMS');

	const {
		form: addressForm,
		enhance: addressEnhance,
		submitting: isAddressSubmitting,
		errors: addressErrors
	} = superForm(data.addressForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingAddress = false;
			}
		}
	});

	const {
		form: contactForm,
		enhance: contactEnhance,
		submitting: isContactSubmitting
	} = superForm(data.contactForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingContact = false;
			}
		}
	});

	const {
		form: hoursForm,
		enhance: hoursEnhance,
		submitting: isHoursSubmitting,
		errors: hoursErrors
	} = superForm(data.operatingHoursForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingHours = false;
			}
		}
	});

	const {
		form: locationForm,
		enhance: locationEnhance,
		submitting: isLocationSubmitting,
		errors: locationErrors
	} = superForm(data.locationForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingLocation = false;
			}
		}
	});

	const {
		form: destinationForm,
		enhance: destinationEnhance,
		submitting: isDestinationSubmitting,
		errors: destinationErrors
	} = superForm(data.destinationForm, {
		resetForm: true,
		taintedMessage: null
	});

	// Edit state tracking
	let editingAddress = false;
	let editingContact = false;
	let editingHours = false;
	let editingLocation = false;
	let geocodingLocation = false;

	$: timezoneLabel = (value: string | null | undefined) =>
		TIMEZONES.find((t) => t.name === value)?.label ?? value?.replace('_', ' ') ?? 'Not set';

	function setHours(dayIndex: number, patch: Record<string, unknown>) {
		const hours = JSONHours;
		hours[dayIndex] = { ...hours[dayIndex], ...patch };
		$hoursForm.operatingHours = JSON.stringify(hours);
	}

	// Check if location needs geocoding
	$: needsGeocoding =
		!location?.lat || !location?.lon || location.lat === '0' || location.lon === '0';
	$: hasAddress = location?.completeAddress && location.completeAddress.trim().length > 0;

	function cancelEdit(section: 'address' | 'contact' | 'hours' | 'settings') {
		switch (section) {
			case 'address':
				editingAddress = false;
				// Reset form
				break;
			case 'contact':
				editingContact = false;
				break;
			case 'hours':
				editingHours = false;
				break;
			case 'settings':
				editingLocation = false;
				// Back to what's stored, so Cancel really discards.
				locationForm.set({ ...data.locationForm.data }, { taint: false });
				break;
		}
	}

	$: JSONHours = JSON.parse($hoursForm.operatingHours) || {};
	// $hoursForm.operatingHours is already a JSON string — submit it as-is.
	// Re-stringifying here double-encoded it, so the server parsed it back to a
	// string (not an object) and the jsonb write silently corrupted the value.
	$: stringifiedHours = $hoursForm.operatingHours || '{}';

	let selectedAddress: AddressResult | null = null;

	function handleAddressSelect(event: CustomEvent<AddressResult>) {
		const address = event.detail;
		selectedAddress = address;

		// $formData.streetOne = address.
		// Now you have both formatted address and coordinates
		// Save to your database, update form state, etc.
	}

	function handleClear() {
		selectedAddress = null;
	}

	$: {
		if (selectedAddress) {
			$addressForm.lat = selectedAddress.coordinates.lat;
			$addressForm.lon = selectedAddress.coordinates.lng;
			$addressForm.completeAddress = selectedAddress.formatted_address;
		}
	}
</script>

{#if location}
	<Page>
		<DetailHeader
			title={location.name}
			subtitle={client.company.companyName}
			avatar={{ src: client.company.companyLogo, initials: (client.company.companyName?.[0] ?? '?').toUpperCase(), kind: 'org' }}
			back={{ href: `/clients/${client.profile.id}?tab=locations`, label: client.company.companyName ?? "Practice" }}
		>
			{#snippet meta()}
				{#if location.city && location.state}
					<span class="inline-flex items-center gap-1 text-sm text-muted-foreground"><MapPin class="size-4" aria-hidden="true" />{location.city}, {location.state}</span>
				{/if}
				{#if needsGeocoding && hasAddress}
					<span class="rounded-full border border-status-warning-border bg-status-warning-bg px-2.5 py-0.5 text-xs font-bold text-status-warning-fg">No coordinates</span>
				{/if}
			{/snippet}
			{#snippet actions()}
				{#if location.companyPhone}
					<Button variant="outline" class="gap-2" href={`tel:${location.companyPhone}`}><Phone class="size-4" aria-hidden="true" />Call office</Button>
				{/if}
				{#if location.email}
					<Button variant="outline" class="gap-2" href={`mailto:${location.email}`}><Mail class="size-4" aria-hidden="true" />Email office</Button>
				{/if}
			{/snippet}
		</DetailHeader>

		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				<!-- Address -->
				<Section title="Address">
					{#snippet actions()}
						{#if needsGeocoding && hasAddress && !editingAddress}
							<form
								method="POST"
								action="?/geocodeLocation"
								use:enhance={() => {
									geocodingLocation = true;
									return async ({ update }) => {
										geocodingLocation = false;
										await update();
									};
								}}
							>
								<Button type="submit" variant="outline" size="sm" class="gap-2" disabled={geocodingLocation}>
									{#if geocodingLocation}<Loader2 class="size-4 animate-spin" aria-hidden="true" />Geocoding…{:else}<MapPin class="size-4" aria-hidden="true" />Get coordinates{/if}
								</Button>
							</form>
						{/if}
						{#if !editingAddress}
							<Button variant="outline" size="sm" class="gap-2" aria-label="Edit address" on:click={() => (editingAddress = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
						{/if}
					{/snippet}
					{#if editingAddress}
						<form method="POST" use:addressEnhance action="?/updateAddress" class="space-y-4">
							{#if $addressErrors && Object.keys($addressErrors).length}
								<Notice tone="negative" alert>
									{#each Object.values($addressErrors) as error}<p>{error}</p>{/each}
								</Notice>
							{/if}
							<div class="space-y-2">
								<Label for="street">Street address</Label>
								<p class="text-sm text-muted-foreground">On file: {location.completeAddress || 'none'}</p>
								<AddressSearchAutocomplete
									bind:selected={selectedAddress}
									on:select={handleAddressSelect}
									on:clear={handleClear}
									placeholder="Search for the new address…"
									country="us"
									maxResults={8}
								/>
								<input type="hidden" name="lat" value={$addressForm.lat} />
								<input type="hidden" name="lon" value={$addressForm.lon} />
								<input type="hidden" name="completeAddress" value={$addressForm.completeAddress} />
							</div>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" disabled={$isAddressSubmitting}>{$isAddressSubmitting ? 'Saving…' : 'Save address'}</Button>
								<Button variant="outline" on:click={() => cancelEdit('address')}>Cancel</Button>
							</div>
						</form>
					{:else}
						<div class="space-y-4">
							<address class="not-italic">{location.completeAddress || 'No address on file'}</address>
							{#if location.completeAddress}
								{#if needsGeocoding}
									<Notice tone="warning" title="Coordinates missing">
										This location hasn't been geocoded, so radius matching can't find it. Use "Get coordinates".
									</Notice>
								{:else}
									<FactGrid
										columns={3}
										facts={[
											{ label: 'Latitude', value: location.lat },
											{ label: 'Longitude', value: location.lon },
											{ label: 'Timezone', value: timezoneLabel(location.timezone) }
										]}
									/>
								{/if}
							{/if}
						</div>
					{/if}
				</Section>

				<!-- Contact -->
				<Section title="Contact" flush={!editingContact}>
					{#snippet actions()}
						{#if !editingContact}
							<Button variant="outline" size="sm" class="gap-2" aria-label="Edit contact details" on:click={() => (editingContact = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
						{/if}
					{/snippet}
					{#if editingContact}
						<form use:contactEnhance method="POST" action="?/updateContactInfo" class="space-y-4">
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="companyPhone">Office phone</Label>
									<PhoneInput id="companyPhone" name="companyPhone" bind:value={$contactForm.companyPhone} />
								</div>
								<!-- The cell number used to be displayed with no field, so every save dropped it. -->
								<div class="space-y-2">
									<Label for="cellPhone">Office cell</Label>
									<PhoneInput id="cellPhone" name="cellPhone" bind:value={$contactForm.cellPhone} />
								</div>
							</div>
							<div class="space-y-2">
								<Label for="email">Office email</Label>
								<Input id="email" name="email" type="email" bind:value={$contactForm.email} placeholder="frontdesk@example.com" />
							</div>
							<div class="space-y-2">
								<Label for="website">Website</Label>
								<Input id="website" name="website" type="url" bind:value={$contactForm.website} placeholder="https://example.com" />
							</div>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" disabled={$isContactSubmitting}>{$isContactSubmitting ? 'Saving…' : 'Save contact'}</Button>
								<Button variant="outline" on:click={() => cancelEdit('contact')}>Cancel</Button>
							</div>
						</form>
					{:else if !location.companyPhone && !location.cellPhone && !location.email && !location.website}
						<p class="px-5 py-4 text-sm text-muted-foreground sm:px-6">No contact details for this location yet.</p>
					{:else}
						<ul class="divide-y">
							{#each [
								{ show: location.companyPhone, label: 'Office phone', value: location.companyPhone, href: `tel:${location.companyPhone}`, icon: Phone, action: 'Call the office phone' },
								{ show: location.cellPhone, label: 'Office cell', value: location.cellPhone, href: `tel:${location.cellPhone}`, icon: Smartphone, action: 'Call the office cell' },
								{ show: location.email, label: 'Email', value: location.email, href: `mailto:${location.email}`, icon: Mail, action: 'Email the office' },
								{ show: location.website, label: 'Website', value: location.website, href: location.website, icon: Globe, action: 'Open the website' }
							].filter((r) => r.show) as row (row.label)}
								<li class="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
									<div class="min-w-0">
										<p class="text-overline uppercase text-muted-foreground">{row.label}</p>
										<p class="break-all font-semibold">{row.value}</p>
									</div>
									<Button variant="ghost" size="icon" class="size-9 shrink-0" href={row.href} target={row.icon === Globe ? '_blank' : undefined} rel={row.icon === Globe ? 'noopener noreferrer' : undefined} aria-label={row.action}>
										<svelte:component this={row.icon} class="size-4" aria-hidden="true" />
									</Button>
								</li>
							{/each}
						</ul>
					{/if}
				</Section>

				<!-- Notification destinations -->
				<Section title="Notification destinations" description="Where this location's notifications go. With none listed, they fall back to the office email and phone above.">
					<div class="space-y-6">
						{#each [{ kind: 'Email', icon: Mail, list: emailDestinations }, { kind: 'SMS', icon: Smartphone, list: smsDestinations }] as group (group.kind)}
							<div class="space-y-2">
								<p class="flex items-center gap-2 text-sm font-semibold">
									<svelte:component this={group.icon} class="size-4 text-muted-foreground" aria-hidden="true" />{group.kind}
								</p>
								{#if group.list.length === 0}
									<p class="text-sm text-muted-foreground">No {group.kind === 'SMS' ? 'SMS' : 'email'} destinations.</p>
								{:else}
									<ul class="divide-y rounded-lg border">
										{#each group.list as dest (dest.id)}
											<li class="flex items-center justify-between gap-3 px-3 py-2">
												<span class="break-all text-sm">{dest.value}</span>
												<ConfirmAction
													action="?/removeContactDestination"
													fields={{ id: dest.id }}
													title="Remove {dest.value}?"
													description="Notifications for {location.name} stop going to {dest.value}. You can add it again later."
													confirmLabel="Remove"
													confirmText="DELETE"
													label="Remove {dest.value}"
													icon={X}
													iconOnly
													variant="ghost"
												/>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/each}

						<form method="POST" action="?/addContactDestination" use:destinationEnhance class="space-y-3 border-t pt-4">
							<input type="hidden" name="type" value={$destinationForm.type} />
							<div class="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_9rem_auto]">
								<div class="space-y-1.5">
									<Label for="dest-value">{$destinationForm.type === 'SMS' ? 'Mobile number' : 'Email address'}</Label>
									{#if $destinationForm.type === 'SMS'}
										<PhoneInput id="dest-value" name="value" bind:value={$destinationForm.value} />
									{:else}
										<Input id="dest-value" name="value" type="email" bind:value={$destinationForm.value} placeholder="alerts@example.com" />
									{/if}
								</div>
								<div class="space-y-1.5">
									<Label for="dest-type">Type</Label>
									<Select.Root
										selected={{ value: $destinationForm.type, label: $destinationForm.type === 'SMS' ? 'SMS' : 'Email' }}
										onSelectedChange={(v) => v && ($destinationForm.type = v.value)}
									>
										<Select.Trigger id="dest-type"><Select.Value /></Select.Trigger>
										<Select.Content>
											<Select.Item value="EMAIL">Email</Select.Item>
											<Select.Item value="SMS">SMS</Select.Item>
										</Select.Content>
									</Select.Root>
								</div>
								<Button type="submit" class="gap-2" disabled={$isDestinationSubmitting}>
									<Plus class="size-4" aria-hidden="true" />{$isDestinationSubmitting ? 'Adding…' : 'Add'}
								</Button>
							</div>
							{#if $destinationErrors.value}<p class="text-sm text-destructive">{$destinationErrors.value}</p>{/if}
							{#if $destinationErrors.type}<p class="text-sm text-destructive">{$destinationErrors.type}</p>{/if}
						</form>
					</div>
				</Section>

				<!-- Operating hours -->
				{#if location.operatingHours}
					<Section title="Operating hours" description={location.timezone ? `Times in ${timezoneLabel(location.timezone)}` : undefined} flush={!editingHours}>
						{#snippet actions()}
							{#if !editingHours}
								<Button variant="outline" size="sm" class="gap-2" aria-label="Edit operating hours" on:click={() => (editingHours = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
							{/if}
						{/snippet}
						{#if editingHours}
							<form use:hoursEnhance method="POST" action="?/updateOperatingHours" class="space-y-4">
								<ul class="divide-y rounded-lg border">
									{#each Array.from({ length: 7 }, (_, i) => i) as dayIndex}
										<li class="grid grid-cols-2 items-center gap-3 p-3 sm:grid-cols-[8rem_1fr_1fr_auto]">
											<span class="col-span-2 font-semibold sm:col-span-1">{getDayName(dayIndex)}</span>
											<div class="space-y-1">
												<Label for={`open-${dayIndex}`} class="text-xs">Opens</Label>
												<Input
													id={`open-${dayIndex}`}
													type="time"
													value={formatTimeString(JSONHours[dayIndex]?.openTime) || ''}
													disabled={JSONHours[dayIndex]?.isClosed}
													on:change={(e) => setHours(dayIndex, { openTime: formatTimeString(e.currentTarget.value) })}
												/>
											</div>
											<div class="space-y-1">
												<Label for={`close-${dayIndex}`} class="text-xs">Closes</Label>
												<Input
													id={`close-${dayIndex}`}
													type="time"
													value={formatTimeString(JSONHours[dayIndex]?.closeTime) || ''}
													disabled={JSONHours[dayIndex]?.isClosed}
													on:change={(e) => setHours(dayIndex, { closeTime: formatTimeString(e.currentTarget.value) })}
												/>
											</div>
											<div class="col-span-2 flex items-center gap-2 sm:col-span-1">
												<Checkbox
													id={`closed-${dayIndex}`}
													checked={!!JSONHours[dayIndex]?.isClosed}
													onCheckedChange={(v) => setHours(dayIndex, { isClosed: v === true })}
												/>
												<Label for={`closed-${dayIndex}`} class="font-normal">Closed</Label>
											</div>
										</li>
									{/each}
								</ul>
								<input type="hidden" name="operatingHours" value={stringifiedHours} />
								{#if $hoursErrors && Object.keys($hoursErrors).length}
									<Notice tone="negative" alert>{#each Object.values($hoursErrors) as error}<p>{error}</p>{/each}</Notice>
								{/if}
								<div class="flex flex-wrap gap-2">
									<Button type="submit" disabled={$isHoursSubmitting}>{$isHoursSubmitting ? 'Saving…' : 'Save hours'}</Button>
									<Button variant="outline" on:click={() => cancelEdit('hours')}>Cancel</Button>
								</div>
							</form>
						{:else}
							<ul class="divide-y">
								{#each Array.from({ length: 7 }, (_, i) => i) as dayIndex}
									{@const day = location.operatingHours[dayIndex]}
									<li class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
										<span class="font-semibold">{getDayName(dayIndex)}</span>
										{#if day?.isClosed}
											<span class="text-muted-foreground">Closed</span>
										{:else if day?.openTime && day?.closeTime}
											<span class="tabular-nums">{formatTimeForDisplay(day.openTime)}–{formatTimeForDisplay(day.closeTime)}</span>
										{:else}
											<span class="text-muted-foreground">Not set</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</Section>
				{/if}
			</div>

			<div class="space-y-6">
				<Section title="Name & timezone">
					{#snippet actions()}
						{#if !editingLocation}
							<Button variant="outline" size="sm" class="gap-2" aria-label="Edit location name and timezone" on:click={() => (editingLocation = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
						{/if}
					{/snippet}
					{#if editingLocation}
						<form use:locationEnhance method="POST" action="?/updateLocation" class="space-y-4">
							<div class="space-y-1.5">
								<Label for="name">Location name</Label>
								<Input id="name" name="name" required maxlength={120} bind:value={$locationForm.name} aria-invalid={$locationErrors.name ? 'true' : undefined} />
								{#if $locationErrors.name}<p class="text-sm text-destructive">{$locationErrors.name}</p>{/if}
							</div>
							<div class="space-y-1.5">
								<Label for="timezone">Timezone</Label>
								<Select.Root
									preventScroll={false}
									selected={{ value: $locationForm.timezone || location.timezone, label: timezoneLabel($locationForm.timezone || location.timezone) }}
									onSelectedChange={(v) => {
										v && ($locationForm.timezone = String(v.value));
									}}
								>
									<Select.Trigger id="timezone"><Select.Value /></Select.Trigger>
									<Select.Content class="max-h-60 overflow-y-auto">
										{#each TIMEZONES as timezone}<Select.Item value={timezone.name}>{timezone.label}</Select.Item>{/each}
									</Select.Content>
								</Select.Root>
								<input name="timezone" type="hidden" value={$locationForm.timezone || location.timezone || ''} />
							</div>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" disabled={$isLocationSubmitting}>{$isLocationSubmitting ? 'Saving…' : 'Save'}</Button>
								<Button variant="outline" on:click={() => cancelEdit('settings')}>Cancel</Button>
							</div>
						</form>
					{:else}
						<div class="space-y-4">
							<FactGrid
								columns={2}
								facts={[
									{ label: 'Name', value: location.name },
									{ label: 'Timezone', value: timezoneLabel(location.timezone) },
									{ label: 'Created', value: format(location.createdAt, 'PP') },
									{ label: 'Updated', value: format(location.updatedAt, 'PP') }
								]}
							/>
							<!-- Requisitions pinned to a different zone than this location: rows created
							     before location edits propagated. Re-syncing keeps local shift times. -->
							{#if timezoneDriftCount > 0}
								<Notice tone="warning" title="{timezoneDriftCount} requisition{timezoneDriftCount === 1 ? '' : 's'} not on this location's timezone">
									<p>{(data.timezoneDrift?.requisitions ?? []).map((r) => `#${r.id} (${r.referenceTimezone})`).join(', ')}</p>
									<form
										class="mt-2"
										method="POST"
										action="?/resyncRequisitionTimezones"
										use:enhance={() => {
											resyncingTimezones = true;
											return async ({ update }) => {
												await update();
												resyncingTimezones = false;
											};
										}}
									>
										<Button type="submit" size="sm" variant="outline" disabled={resyncingTimezones}>
											{resyncingTimezones ? 'Re-syncing…' : `Re-sync to ${timezoneLabel(location.timezone)}`}
										</Button>
									</form>
									<p class="mt-2">Upcoming shifts keep their local start and end times; past shifts are left as they are.</p>
								</Notice>
							{/if}
						</div>
					{/if}
				</Section>

				<Section title="Practice">
					<div class="space-y-4">
						<div class="flex items-center gap-3">
							<PersonAvatar
								name="{client.user.firstName} {client.user.lastName}"
								src={client.user.avatarUrl}
								initials={initialsOf(client.user.firstName, client.user.lastName)}
								size="md"
							/>
							<div class="min-w-0">
								<p class="font-semibold">{client.user.firstName} {client.user.lastName}</p>
								<p class="truncate text-sm text-muted-foreground">{client.user.email}</p>
							</div>
						</div>
						<FactGrid
							columns={2}
							facts={[
								{ label: 'Practice', value: client.company.companyName },
								...(client.company.licenseNumber ? [{ label: 'License', value: client.company.licenseNumber }] : [])
							]}
						/>
						<Button variant="outline" size="sm" href={`/clients/${client.profile.id}`}>View practice</Button>
					</div>
				</Section>
			</div>
		</div>
	</Page>
{:else}
	<Page width="narrow">
		<EmptyState icon={AlertCircle} title="Location not found" description="This location couldn't be found. It may have been removed.">
			<Button href="/clients">Back to clients</Button>
		</EmptyState>
	</Page>
{/if}
