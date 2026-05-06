<script lang="ts">
	import { getDayName } from '$lib/_helpers';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { Avatar } from '$lib/components/ui/avatar';
	import { format } from 'date-fns';
	import {
		ChevronLeft,
		Edit,
		Plus,
		Building,
		Phone,
		Mail,
		MapPin,
		Smartphone,
		Clock,
		User,
		Briefcase,
		Settings,
		AlertCircle,
		Save,
		X,
		Loader2
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { formatTimeForDisplay, formatTimeString } from '$lib/_helpers/UTCTimezoneUtils';
	import * as Select from '$lib/components/ui/select';
	import { STATES, TIMEZONES } from '$lib/config/constants';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import type { AddressResult } from '$lib/types.js';
	import { enhance } from '$app/forms';

	export let data;

	$: client = data.client;
	$: location = data.location;

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
		submitting: isLocationSubmitting
	} = superForm(data.locationForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingLocation = false;
			}
		}
	});

	// Edit state tracking
	let editingAddress = false;
	let editingContact = false;
	let editingHours = false;
	let editingLocation = false;
	let geocodingLocation = false;

	$: selectedState = location?.state || '';
	$: selectedTimezone = location?.timezone || '';

	// Check if location needs geocoding
	$: needsGeocoding =
		!location?.lat || !location?.lon || location.lat === '0' || location.lon === '0';
	$: hasAddress = location?.completeAddress && location.completeAddress.trim().length > 0;

	function cancelEdit(section) {
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

				break;
		}
	}

	$: JSONHours = JSON.parse($hoursForm.operatingHours) || {};
	$: stringifiedHours = JSON.stringify($hoursForm.operatingHours) || {};

	let selectedAddress: AddressResult | null = null;

	function handleAddressSelect(event: CustomEvent<AddressResult>) {
		const address = event.detail;
		console.log('Selected address:', address);
		selectedAddress = address;

		// $formData.streetOne = address.
		// Now you have both formatted address and coordinates
		// Save to your database, update form state, etc.
	}

	function handleClear() {
		console.log('Address cleared');
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
	<section class="container mx-auto px-4 py-6">
		<div class="flex flex-col gap-6">
			<!-- Header with breadcrumb and actions -->
			<div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						class="h-8 w-8"
						on:click={() => window.history.back()}
					>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<div>
						<h1 class="text-3xl font-bold">{location.name}</h1>
						<p class="text-muted-foreground">
							<a href={`/clients/${client.profile.id}`} class="hover:underline">
								{client.company.companyName}
							</a>
							/ Location Details
						</p>
					</div>
				</div>
			</div>

			<!-- Location overview card -->
			<div class="bg-white rounded-lg shadow-sm p-6">
				<div class="flex flex-col md:flex-row gap-6">
					<!-- Company logo and basic info -->
					<div class="flex items-start gap-4">
						<div class="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden border bg-white">
							{#if client.company.companyLogo}
								<img
									src={client.company.companyLogo}
									alt="{client.company.companyName} logo"
									class="h-full w-full object-contain"
								/>
							{:else}
								<div
									class="h-full w-full flex items-center justify-center bg-gray-100 text-gray-400"
								>
									<Building class="h-8 w-8" />
								</div>
							{/if}
						</div>

						<div class="flex-1">
							<h2 class="text-xl font-semibold">{location.name}</h2>
							<Button
								variant="link"
								href={`/clients/${client.profile.id}`}
								class="text-muted-foreground px-0">{client.company.companyName}</Button
							>

							<!-- Quick contact info -->
							<div class="mt-3 flex flex-col sm:flex-row gap-3 text-sm">
								{#if location.companyPhone}
									<a
										href={`tel:${location.companyPhone}`}
										class="flex items-center gap-2 text-blue-600 hover:underline"
									>
										<Phone class="h-4 w-4" />
										{location.companyPhone}
									</a>
								{/if}

								{#if location.email}
									<a
										href={`mailto:${location.email}`}
										class="flex items-center gap-2 text-blue-600 hover:underline"
									>
										<Mail class="h-4 w-4" />
										{location.email}
									</a>
								{/if}

								{#if location.city && location.state}
									<div class="flex items-center gap-2 text-muted-foreground">
										<MapPin class="h-4 w-4" />
										{location.city}, {location.state}
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Main content grid -->
			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Left column - Location details -->
				<div class="lg:col-span-2 space-y-6">
					<!-- Address Information -->
					<Card>
						<CardHeader>
							<div class="flex items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<MapPin class="h-5 w-5 text-blue-600" />
									Address Information
								</CardTitle>
								<div class="flex items-center gap-2">
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
											<Button
												type="submit"
												variant="outline"
												size="sm"
												class="gap-2 border-orange-500 text-orange-600 hover:bg-orange-50"
												disabled={geocodingLocation}
											>
												{#if geocodingLocation}
													<Loader2 class="h-4 w-4 animate-spin" />
													Geocoding...
												{:else}
													<MapPin class="h-4 w-4" />
													Get Coordinates
												{/if}
											</Button>
										</form>
									{/if}
									{#if !editingAddress}
										<Button variant="ghost" size="sm" on:click={() => (editingAddress = true)}>
											<Edit class="h-4 w-4" />
										</Button>
									{:else}
										<div class="space-y-4">
											<!-- Address Display -->
											<div>
												<h3 class="text-sm font-medium text-muted-foreground">Physical Address</h3>
												<address class="mt-1 not-italic">
													{#if location.completeAddress}
														{location.completeAddress}<br />
													{:else}
														<p class="text-muted-foreground">No location provided</p>
													{/if}
												</address>
											</div>

											<!-- Coordinates Status -->
											{#if location.completeAddress}
												<div class="pt-3 border-t">
													<h3 class="text-sm font-medium text-muted-foreground mb-2">
														Coordinates
													</h3>
													{#if needsGeocoding}
														<div
															class="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md"
														>
															<AlertCircle class="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
															<div class="flex-1">
																<p class="text-sm font-medium text-orange-900">
																	Coordinates Missing
																</p>
																<p class="text-xs text-orange-700 mt-1">
																	This location hasn't been geocoded yet. Click "Get Coordinates" to
																	fetch latitude and longitude.
																</p>
															</div>
														</div>
													{:else}
														<div class="grid grid-cols-2 gap-3">
															<div class="p-2 bg-gray-50 rounded border">
																<p class="text-xs text-muted-foreground">Latitude</p>
																<p class="font-mono text-sm font-medium">{location.lat}</p>
															</div>
															<div class="p-2 bg-gray-50 rounded border">
																<p class="text-xs text-muted-foreground">Longitude</p>
																<p class="font-mono text-sm font-medium">{location.lon}</p>
															</div>
														</div>
														{#if location.timezone}
															<div class="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
																<p class="text-xs text-muted-foreground">Timezone</p>
																<p class="text-sm font-medium text-blue-900">{location.timezone}</p>
															</div>
														{/if}
													{/if}
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							{#if editingAddress}
								<form method="POST" use:addressEnhance action="?/updateAddress" class="space-y-4">
									{#if $addressErrors}
										<div class="text-red-500 text-sm">
											{#each Object.values($addressErrors) as error}
												<p>{error}</p>
											{/each}
										</div>
									{/if}
									<div class="space-y-2">
										<Label for="street">Street Address</Label>
										<AddressSearchAutocomplete
											bind:selected={selectedAddress}
											on:select={handleAddressSelect}
											on:clear={handleClear}
											placeholder="Enter your address..."
											country="us"
											maxResults={8}
										/>
										<input type="hidden" name="lat" value={$addressForm.lat} />
										<input type="hidden" name="lon" value={$addressForm.lon} />
										<input
											type="hidden"
											name="completeAddress"
											value={$addressForm.completeAddress}
										/>
									</div>
									<div class="flex gap-2 pt-4">
										<Button type="submit" size="sm" class="gap-2 bg-green-400 hover:bg-green-500">
											<Save class="h-4 w-4" />
											{#if $isAddressSubmitting}
												Saving...
											{:else}
												Save Changes
											{/if}
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											on:click={() => cancelEdit('address')}
											class="gap-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-500"
										>
											<X class="h-4 w-4" />
											Cancel
										</Button>
									</div>
								</form>
							{:else}
								<div class="space-y-4">
									<div>
										<h3 class="text-sm font-medium text-muted-foreground">Physical Address</h3>
										<address class="mt-1 not-italic">
											{#if location.completeAddress}
												{location.completeAddress}<br />
											{:else}
												<p>No location provided</p>
											{/if}
										</address>
									</div>
								</div>
							{/if}
						</CardContent>
					</Card>

					<!-- Contact Information -->
					<Card>
						<CardHeader>
							<div class="flex items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<Phone class="h-5 w-5 text-green-600" />
									Contact Information
								</CardTitle>
								{#if !editingContact}
									<Button variant="ghost" size="sm" on:click={() => (editingContact = true)}>
										<Edit class="h-4 w-4" />
									</Button>
								{/if}
							</div>
						</CardHeader>
						<CardContent>
							{#if editingContact}
								<form
									use:contactEnhance
									method="POST"
									action="?/updateContactInfo"
									class="space-y-4"
								>
									<div class="space-y-2">
										<Label for="companyPhone">Office Phone</Label>
										<PhoneInput
											id="companyPhone"
											name="companyPhone"
											bind:value={$contactForm.companyPhone}
											placeholder="Enter office phone number"
										/>
									</div>
									<div class="space-y-2">
										<Label for="email">Office Email Address</Label>
										<Input
											id="email"
											name="email"
											type="email"
											bind:value={$contactForm.email}
											placeholder="Enter office email address"
										/>
									</div>

									<div class="flex gap-2 pt-4">
										<Button type="submit" size="sm" class="gap-2 bg-green-400 hover:bg-green-500">
											<Save class="h-4 w-4" />
											{#if $isContactSubmitting}
												Saving...
											{:else}
												Save Changes
											{/if}
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											on:click={() => cancelEdit('contact')}
											class="gap-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-500"
										>
											<X class="h-4 w-4" />
											Cancel
										</Button>
									</div>
								</form>
							{:else}
								<div class="space-y-4">
									{#if location.companyPhone}
										<div class="flex items-center justify-between">
											<div>
												<h3 class="text-sm font-medium">Office Phone</h3>
												<p class="text-muted-foreground">{location.companyPhone}</p>
											</div>
											<Button variant="outline" size="sm" href={`tel:${location.companyPhone}`}>
												<Phone class="h-4 w-4" />
											</Button>
										</div>
									{/if}

									{#if location.cellPhone}
										<div class="flex items-center justify-between">
											<div>
												<h3 class="text-sm font-medium">Mobile Phone</h3>
												<p class="text-muted-foreground">{location.cellPhone}</p>
											</div>
											<Button variant="outline" size="sm" href={`tel:${location.cellPhone}`}>
												<Smartphone class="h-4 w-4" />
											</Button>
										</div>
									{/if}

									{#if location.email}
										<div class="flex items-center justify-between">
											<div>
												<h3 class="text-sm font-medium">Email Address</h3>
												<p class="text-muted-foreground">{location.email}</p>
											</div>
											<Button variant="outline" size="sm" href={`mailto:${location.email}`}>
												<Mail class="h-4 w-4" />
											</Button>
										</div>
									{/if}

									{#if !location.companyPhone && !location.cellPhone && !location.email}
										<p class="text-sm text-muted-foreground">
											No contact information available for this location.
										</p>
									{/if}
								</div>
							{/if}
						</CardContent>
					</Card>

					<!-- Operating Hours -->
					{#if location.operatingHours}
						<Card>
							<CardHeader>
								<div class="flex items-center justify-between">
									<CardTitle class="flex items-center gap-2">
										<Clock class="h-5 w-5 text-purple-600" />
										Operating Hours
									</CardTitle>
									{#if !editingHours}
										<Button variant="ghost" size="sm" on:click={() => (editingHours = true)}>
											<Edit class="h-4 w-4" />
										</Button>
									{/if}
								</div>
							</CardHeader>
							<CardContent>
								{#if editingHours}
									<form
										use:hoursEnhance
										method="POST"
										action="?/updateOperatingHours"
										class="space-y-4"
									>
										{#each Array.from({ length: 7 }, (_, i) => i) as dayIndex}
											<div class="space-y-2">
												<Label>{getDayName(dayIndex)}</Label>
												<div class="grid grid-cols-3 gap-2 items-center">
													<div class="space-y-1">
														<Label for={`open-${dayIndex}`} class="text-xs">Open Time</Label>
														<Input
															id={`open-${dayIndex}`}
															type="time"
															value={formatTimeString(JSONHours[dayIndex]?.openTime) || ''}
															disabled={JSONHours[dayIndex]?.isClosed}
															on:change={(e) => {
																let hours = JSONHours;
																hours[dayIndex].openTime = formatTimeString(e.target?.value);
																$hoursForm.operatingHours = JSON.stringify(hours);
															}}
														/>
													</div>
													<div class="space-y-1">
														<Label for={`close-${dayIndex}`} class="text-xs">Close Time</Label>
														<Input
															id={`close-${dayIndex}`}
															type="time"
															value={formatTimeString(JSONHours[dayIndex]?.closeTime) || ''}
															disabled={JSONHours[dayIndex]?.isClosed}
															on:change={(e) => {
																let hours = JSONHours;
																hours[dayIndex].closeTime = formatTimeString(e.target?.value);
																$hoursForm.operatingHours = JSON.stringify(hours);
															}}
														/>
													</div>
													<div class="space-y-1">
														<Label class="text-xs">Closed</Label>
														<input
															type="checkbox"
															checked={JSONHours[dayIndex].isClosed}
															class="h-4 w-4"
															on:change={(e) => {
																let hours = JSONHours;
																hours[dayIndex].isClosed = e.target?.checked;

																$hoursForm.operatingHours = JSON.stringify(hours);
															}}
														/>
													</div>
												</div>
											</div>
										{/each}
										<input type="hidden" name="operatingHours" bind:value={stringifiedHours} />
										{#if $hoursErrors}
											<div class="text-red-500 text-sm">
												{#each Object.values($hoursErrors) as error}
													<p>{error}</p>
												{/each}
											</div>
										{/if}
										<div class="flex gap-2 pt-4">
											<Button type="submit" size="sm" class="gap-2 bg-green-400 hover:bg-green-500">
												<Save class="h-4 w-4" />
												{#if $isHoursSubmitting}
													Saving...
												{:else}
													Save Changes
												{/if}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												on:click={() => cancelEdit('hours')}
												class="gap-2 text-red-500 border-red-500 hover:bg-red-50 hover:text-red-500"
											>
												<X class="h-4 w-4" />
												Cancel
											</Button>
										</div>
									</form>
								{:else}
									<div class="space-y-3">
										{#each Array.from({ length: 7 }, (_, i) => i) as dayIndex}
											<div
												class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
											>
												<span class="font-medium text-gray-700 w-24">
													{getDayName(dayIndex)}
												</span>
												<span class="text-gray-600">
													{#if location.operatingHours[dayIndex]?.isClosed}
														<span class="text-red-500 font-medium">Closed</span>
													{:else if location.operatingHours[dayIndex]?.openTime && location.operatingHours[dayIndex]?.closeTime}
														<span class="font-medium">
															{formatTimeForDisplay(location.operatingHours[dayIndex].openTime)}
															- {formatTimeForDisplay(location.operatingHours[dayIndex].closeTime)}
														</span>
													{:else}
														<span class="text-muted-foreground">Hours not set</span>
													{/if}
												</span>
											</div>
										{/each}

										{#if location?.timezone}
											<div class="pt-2 text-xs text-muted-foreground border-t">
												All times shown in {location.timezone.replace('_', ' ')}
											</div>
										{/if}
									</div>
								{/if}
							</CardContent>
						</Card>
					{/if}
				</div>

				<!-- Right column - Related information -->
				<div class="space-y-6">
					<!-- Client Information -->
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center gap-2">
								<User class="h-5 w-5 text-blue-600" />
								Client Information
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<Avatar class="h-10 w-10">
										<AvatarImage
											src={client.user.avatarUrl}
											alt={`${client.user.firstName} ${client.user.lastName}`}
										/>
										<AvatarFallback>
											{convertNameToInitials(client.user.firstName, client.user.lastName)}
										</AvatarFallback>
									</Avatar>
									<div>
										<p class="font-medium">{client.user.firstName} {client.user.lastName}</p>
										<p class="text-sm text-muted-foreground">{client.user.email}</p>
									</div>
								</div>

								<Separator />

								<div class="space-y-2">
									<h3 class="text-sm font-medium">Company</h3>
									<p class="text-sm">{client.company.companyName}</p>

									{#if client.company.licenseNumber}
										<div class="mt-2">
											<h3 class="text-sm font-medium">License Number</h3>
											<p class="text-sm text-muted-foreground">{client.company.licenseNumber}</p>
										</div>
									{/if}
								</div>

								<div class="pt-2">
									<Button variant="outline" size="sm" href={`/clients/${client.profile.id}`}
										>View Client Profile
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					<!-- Active Requisitions -->
					<!-- <Card>
						<CardHeader class="flex flex-row items-center justify-between">
							<CardTitle class="flex items-center gap-2">
								<Briefcase class="h-5 w-5 text-amber-600" />
								Active Requisitions
							</CardTitle>
							<Button variant="outline" size="sm">
								<Plus class="h-4 w-4" />
							</Button>
						</CardHeader>
						<CardContent>
						</CardContent>
					</Card> -->

					<!-- Location Settings -->
					<Card>
						<CardHeader>
							<div class="flex items-center justify-between">
								<CardTitle class="flex items-center gap-2">
									<Settings class="h-5 w-5 text-gray-600" />
									Location Settings
								</CardTitle>
								{#if !editingLocation}
									<Button variant="ghost" size="sm" on:click={() => (editingLocation = true)}>
										<Edit class="h-4 w-4" />
									</Button>
								{/if}
							</div>
						</CardHeader>
						<CardContent>
							{#if editingLocation}
								<form use:locationEnhance method="POST" action="?/updateLocation" class="space-y-4">
									<div class="space-y-2">
										<Label for="timezone">Timezone</Label>
										<Select.Root
											preventScroll={false}
											selected={selectedTimezone}
											onSelectedChange={(v) => {
												v && ($locationForm.timezone = String(v.value));
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
											<Input name="timezone" type="hidden" value={$locationForm.timezone} />
										</Select.Root>
									</div>

									<div class="flex gap-2 pt-4">
										<Button type="submit" size="sm" class="gap-2 bg-green-400 hover:bg-green-500">
											<Save class="h-4 w-4" />
											{#if $isLocationSubmitting}
												Saving...
											{:else}
												Save Changes
											{/if}
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											on:click={() => cancelEdit('settings')}
											class="gap-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-500"
										>
											<X class="h-4 w-4" />
											Cancel
										</Button>
									</div>
								</form>
							{:else}
								<div class="space-y-3">
									<div class="flex justify-between items-center">
										<span class="text-sm">Timezone</span>
										<span class="text-sm font-medium"
											>{location.timezone?.replace('_', ' ') || 'Not set'}</span
										>
									</div>
									<div class="flex justify-between items-center">
										<span class="text-sm">Created</span>
										<span class="text-sm text-muted-foreground"
											>{format(location.createdAt, 'PP')}</span
										>
									</div>

									<div class="flex justify-between items-center">
										<span class="text-sm">Last Updated</span>
										<span class="text-sm text-muted-foreground"
											>{format(location.updatedAt, 'PP')}</span
										>
									</div>
								</div>
							{/if}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	</section>
{:else}
	<section
		class="container mx-auto px-4 py-6 flex flex-col items-center text-center sm:justify-center gap-4 md:gap-6"
	>
		<div class="p-8 bg-gray-50 rounded-lg">
			<AlertCircle class="h-12 w-12 mx-auto text-gray-400 mb-4" />
			<h2 class="text-2xl font-bold mb-2">Location Not Found</h2>
			<p class="text-gray-500 mb-6">The requested location could not be found in our system.</p>
			<Button type="button" on:click={() => window.history.back()}>Go Back</Button>
		</div>
	</section>
{/if}
