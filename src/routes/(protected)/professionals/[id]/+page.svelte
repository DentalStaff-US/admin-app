<script lang="ts">
	import { CANDIDATE_STATUS, USER_ROLES } from '$lib/config/constants';
	import type { CandidateWithProfile } from '$lib/server/database/queries/candidates';
	import type { PageData } from './$types';
	import * as Avatar from '$lib/components/ui/avatar';
	import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Calendar from '$lib/components/calendar/calendar.svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs/index.js';
	import { Input } from '$lib/components/ui/input';
	import PhoneInput from '$lib/components/PhoneInput.svelte';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import AdminProfileComments from '$lib/views/admin/adminProfileComments.svelte';
	import {
		Save,
		X,
		Edit,
		User,
		MapPin,
		Briefcase,
		Calendar as CalendarIcon,
		FileText,
		Clock,
		Phone,
		Mail,
		DollarSign,
		AlertCircle,
		Download,
		MoreHorizontal,
		Trash2,
		Plus,
		MessageSquare,
		Delete,
		Trash,
		Lock,
		Unlock
	} from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { format } from 'date-fns';
	import { CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { StatusBadge } from '$lib/components/ui/status-badge';
	import { Card } from 'flowbite-svelte';
	import { enhance } from '$app/forms';
	import { CandidateStatusSchema } from '$lib/config/zod-schemas';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import type { AddressResult } from '$lib/types';
	import DialogTitle from '$lib/components/ui/dialog/dialog-title.svelte';
	import { Dialog, DialogTrigger } from '$lib/components/ui/dialog';
	import DialogContent from '$lib/components/ui/dialog/dialog-content.svelte';
	import DialogHeader from '$lib/components/ui/dialog/dialog-header.svelte';
	import FileDropzone from '$lib/components/file-upload.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Separator } from '$lib/components/ui/separator';
	import { tick } from 'svelte';

	interface FileUploadResult {
		filename: string;
		url: string;
	}

	export let data: PageData;
	let initials: string = '';
	let selectedAddress: AddressResult | null = null;
	let partialFailures: { filename: string; error: string }[] = [];
	const docsForm = superForm(data.documentsForm);
	const { enhance: docsEnhance, form: docsFormData, errors: docsErrors } = docsForm;

	$: birthdate = new Date(candidate?.profile.birthday as string);
	$: user = data.user;
	$: isAdmin = user?.role === USER_ROLES.SUPERADMIN;
	$: candidate = data.candidate as CandidateWithProfile | null;
	// $: supportTickets = data.supportTickets || [];
	$: workHistory = data.workHistory || [];
	$: documents = data.documents || [];
	$: disciplines = data.allDisciplines || [];

	$: console.log(disciplines);

	// Edit state tracking
	let editingPersonal = false;
	let editingWork = false;
	let editingLocation = false;
	let editingDisciplines = false;
	let editableDisciplines = [];
	let selectedNewDisciplineId = '';
	let selectedNewExperienceLevelId = '';
	let newDisciplineMinRate = 0;
	let newDisciplineMaxRate = 0;

	function cancelEdit(section: string) {
		switch (section) {
			case 'personal':
				editingPersonal = false;
				break;
			case 'work':
				editingWork = false;
				break;
			case 'location':
				editingLocation = false;
				break;
		}
	}

	$: {
		if (candidate) {
			initials = convertNameToInitials(candidate.user.firstName, candidate.user.lastName);
		}
	}

	const { form: statusForm, enhance: statusEnhance } = superForm(data.statusForm);
	const {
		form: personalDetailsForm,
		enhance: detailsEnhance,
		submitting: detailsSubmitting
	} = superForm(data.personalDetailsForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingPersonal = false;
				// Clear the autocomplete selection so the next time the admin
				// opens the edit panel the address field starts blank again
				// (matching the initial-load behavior). Without this reset the
				// previously-submitted address sticks across edits.
				selectedAddress = null;
			}
		}
	});

	function getFileIcon(filename: string) {
		const extension = filename?.split('.').pop()?.toLowerCase() || '';

		if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
			return 'image';
		} else if (['pdf'].includes(extension)) {
			return 'pdf';
		} else if (['doc', 'docx'].includes(extension)) {
			return 'word';
		} else {
			return 'generic';
		}
	}

	const {
		form: disciplinesFormData,
		enhance: disciplinesEnhance,
		errors: disciplinesErrors,
		submitting: disciplinesSubmitting
	} = superForm(data.disciplinesForm, {
		dataType: 'json', // Add this!
		onResult: ({ result }) => {
			if (result.type === 'success') {
				editingDisciplines = false;
			}
		}
	});

	$: availableDisciplinesFiltered =
		data.availableDisciplines?.filter(
			(d) => !$disciplinesFormData.disciplines.some((ed) => ed.disciplineId === d.id)
		) || [];
	$: urlStrings = JSON.stringify($docsFormData.urls || []);
	$: fileStrings = JSON.stringify(getFileUploads($docsFormData));

	// Handle document deletion
	function handleDeleteDocument(documentId: string) {
		console.log(`Deleting document ${documentId}`);
		// Here you would normally delete the file from your server
		// and update the documents list afterward
	}

	async function handleDocumentsUpload(files: File[]) {
		if (files && files.length > 0) {
			// Reset state
			partialFailures = [];

			try {
				console.log(files);
				// Create upload promises for each file
				const uploadPromises = files.map(async (file) => {
					const formData = new FormData();
					formData.append('file', file);
					formData.append('location', 'candidate-documents');

					return fetch('/api/uploadFile', {
						method: 'POST',
						body: formData
					})
						.then(async (response) => {
							if (!response.ok) {
								throw new Error(`Server responded with ${response.status}`);
							}
							const data = await response.json();
							return {
								filename: file.name,
								url: data.url,
								success: true
							};
						})
						.catch((error) => {
							return {
								filename: file.name,
								error: error.message || 'Upload failed',
								success: false
							};
						});
				});

				// Use Promise.allSettled to handle all uploads, even if some fail
				const results = await Promise.allSettled(uploadPromises);

				// Process results
				const successfulUploads: FileUploadResult[] = [];

				results.forEach((result) => {
					if (result.status === 'fulfilled') {
						const uploadResult = result.value;
						if (uploadResult.success) {
							successfulUploads.push({
								filename: uploadResult.filename,
								url: uploadResult.url
							});
						} else {
							partialFailures.push({
								filename: uploadResult.filename,
								error: uploadResult.error
							});
						}
					} else {
						// This would happen if the promise itself rejects before the catch
						partialFailures.push({
							filename: 'Unknown file',
							error: result.reason || 'Unknown error'
						});
					}
				});

				// Update form with successful uploads
				if (successfulUploads.length > 0) {
					// Append to existing files if needed
					const existingFiles = $docsFormData.filesData
						? (JSON.parse(JSON.stringify($docsFormData.filesData as string)) as FileUploadResult[])
						: [];

					const updatedFiles = [...existingFiles, ...successfulUploads];
					$docsFormData.filesData = JSON.stringify(updatedFiles);

					// For backward compatibility, also store just the URLs
					$docsFormData.urls = updatedFiles.map((file) => file.url);

					await tick();

					// Submit form if we have at least one successful upload
					const form = document.getElementById('documents-form') as HTMLFormElement;
					if (form) {
						form.requestSubmit();
					}

					// If some files failed but others succeeded
					if (partialFailures.length > 0 && successfulUploads.length > 0) {
						console.warn(
							`${successfulUploads.length} files uploaded, ${partialFailures.length} failed`
						);
					}
				} else if (partialFailures.length > 0) {
					// All uploads failed
					throw new Error('All file uploads failed');
				}
			} catch (error) {
				console.error('Error in documents upload process:', error);
				throw error; // Re-throw to let the FileDropzone component show the error
			}
		}
	}

	function getFileUploads(formData: any): FileUploadResult[] {
		if (formData.filesData) {
			try {
				return JSON.parse(formData.filesData);
			} catch (e) {
				return [];
			}
		}

		// Single file fallback
		if (formData.fileData) {
			try {
				const singleFile = JSON.parse(formData.fileData);
				return [singleFile];
			} catch (e) {
				return [];
			}
		}

		// Legacy format fallback
		if (formData.url) {
			return [{ filename: 'Uploaded file', url: formData.url }];
		}

		if (formData.urls && Array.isArray(formData.urls)) {
			return formData.urls.map((url: string, index: number) => ({
				filename: `File ${index + 1}`,
				url
			}));
		}

		return [];
	}

	// Initialize editable disciplines when entering edit mode
	function startEditingDisciplines() {
		editingDisciplines = true;
	}

	function addNewDiscipline() {
		if (!selectedNewDisciplineId || !selectedNewExperienceLevelId) {
			return;
		}

		if (newDisciplineMaxRate < newDisciplineMinRate) {
			alert('Maximum rate must be greater than or equal to minimum rate');
			return;
		}

		$disciplinesFormData.disciplines = [
			...$disciplinesFormData.disciplines,
			{
				disciplineId: selectedNewDisciplineId,
				experienceLevelId: selectedNewExperienceLevelId,
				preferredHourlyMin: newDisciplineMinRate,
				preferredHourlyMax: newDisciplineMaxRate
			}
		];

		// Reset form
		selectedNewDisciplineId = '';
		selectedNewExperienceLevelId = '';
		newDisciplineMinRate = 0;
		newDisciplineMaxRate = 0;
	}

	function removeDisciplineFromEdit(disciplineId: string) {
		$disciplinesFormData.disciplines = $disciplinesFormData.disciplines.filter(
			(d) => d.disciplineId !== disciplineId
		);
	}

	function cancelDisciplineEdit() {
		editingDisciplines = false;
		$disciplinesFormData.disciplines = [];
	}

	function getDisciplineName(disciplineId: string) {
		const discipline = data.availableDisciplines?.find((d) => d.id === disciplineId);
		return discipline?.name || 'Unknown';
	}

	function getExperienceLevelName(experienceLevelId: string) {
		const level = data.experienceLevels?.find((l) => l.id === experienceLevelId);
		return level?.value || 'Unknown';
	}
	$: disciplinesString = JSON.stringify(editableDisciplines);

	function handleAddressSelect(event: CustomEvent<AddressResult>) {
		selectedAddress = event.detail;
	}

	function handleClear() {
		selectedAddress = null;
	}
	// Intentionally do NOT prefill `selectedAddress` from the existing profile.
	// `AddressSearchAutocomplete` has an internal `$: if (selected) query = ...`
	// reactive that fights typing whenever `selected` is non-null on mount,
	// freezing the input. Every other use of this component in the codebase
	// starts blank — we match that pattern. The current address is rendered as
	// read-only text below so the admin can see what's on file, and the server
	// action skips the update when `completeAddress` is blank so saving with
	// the autocomplete empty doesn't wipe the existing address.
</script>

{#if candidate}
	<section class="container mx-auto px-4 py-6">
		<div class="flex flex-col gap-6">
			<!-- Clean Header -->
			<div class="py-4">
				<div class="flex items-center justify-between">
					<div class="flex gap-4 items-center">
						<Avatar.Root class="bg-gray-300 rounded-lg w-16 h-16">
							<Avatar.Fallback class="bg-transparent text-xl font-semibold">
								{initials}
							</Avatar.Fallback>
							<Avatar.Image src={candidate.user.avatarUrl} />
						</Avatar.Root>
						<div>
							<h1 class="text-2xl font-bold">
								{candidate.user.firstName}
								{candidate.user.lastName}
								{#if user.role === USER_ROLES.SUPERADMIN}
									<span class="text-xs text-muted-foreground">#{candidate.profile.puid}</span>
								{/if}
							</h1>
							<p class="text-sm text-gray-500">Professional Member</p>
							<div class="flex items-center gap-2 mt-1">
								<StatusBadge
									status={candidate.profile.status}
									label={candidate.profile.status === 'ACTIVE'
										? 'Approved'
										: candidate.profile.status === 'DENIED'
											? 'Denied'
											: candidate.profile.status === 'INACTIVE'
												? 'Inactive'
												: 'Pending Review'}
								/>
							</div>
						</div>
					</div>

					{#if isAdmin}
						<div class="flex items-center gap-3">
							<form
								use:enhance
								id="status-form"
								action="?/updateStatus"
								method="POST"
								class="flex items-center gap-2"
							>
								<Label class="text-sm text-gray-600">Status:</Label>
								<Select.Root
									preventScroll={false}
									selected={{
										value: candidate.profile.status,
										label:
											candidate.profile.status === 'ACTIVE'
												? 'Approved'
												: candidate.profile.status === 'DENIED'
													? 'Denied'
													: candidate.profile.status === 'INACTIVE'
														? 'Inactive'
														: 'Pending'
									}}
									onSelectedChange={(selected) => {
										if (selected) {
											const form = document.getElementById('status-form');
											const hiddenInput = form?.querySelector('input[name="status"]');
											hiddenInput.value = selected.value;

											form?.submit();
										}
									}}
								>
									<Select.Trigger class="h-8 w-32 bg-white">
										<Select.Value />
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="PENDING">Pending</Select.Item>
										<Select.Item value="ACTIVE">Approved</Select.Item>
										<Select.Item value="INACTIVE">Inactive</Select.Item>
										<Select.Item value="DENIED">Denied</Select.Item>
									</Select.Content>
									<Select.Input type="hidden" name="status" value={candidate.profile.status} />
								</Select.Root>
							</form>
						</div>
					{/if}
				</div>
			</div>

			<!-- Tabs section -->
			<Tabs class="w-full">
				<TabsList class="flex flex-col items-stretch md:flex-row w-full lg:w-fit h-fit">
					<TabsTrigger value="profile" class="gap-2 flex-1">
						<User class="h-4 w-4" />
						<span>Profile</span>
					</TabsTrigger>
					<!-- <TabsTrigger value="availability" class="gap-2 flex-1">
                        <CalendarIcon class="h-4 w-4" />
                        <span >Availability</span>
                    </TabsTrigger> -->
					<TabsTrigger value="documents" class="gap-2 flex-1">
						<FileText class="h-4 w-4" />
						<span>Documents</span>
					</TabsTrigger>
					{#if isAdmin}
						<TabsTrigger value="work-history" class="gap-2 flex-1">
							<Clock class="h-4 w-4" />
							<span>Work History</span>
						</TabsTrigger>
					{/if}
					<TabsTrigger value="support" class="gap-2 flex-1">
						<Mail class="h-4 w-4" />
						<span>Support</span>
					</TabsTrigger>
				</TabsList>

				<!-- Profile Tab -->
				<TabsContent value="profile" class="mt-6">
					<div class="grid gap-6">
						<!-- Personal Details Card -->
						<Card class="w-full max-w-none">
							<CardHeader class="pb-3">
								<div class="flex items-center justify-between">
									<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
										<User class="h-4 w-4" />
										Personal Details
									</CardTitle>
									{#if !editingPersonal && isAdmin}
										<Button variant="ghost" size="sm" on:click={() => (editingPersonal = true)}>
											<Edit class="h-4 w-4" />
										</Button>
									{/if}
								</div>
							</CardHeader>
							<CardContent class="pt-0">
								{#if editingPersonal}
									<!-- Personal Edit Form -->
									<form
										use:detailsEnhance
										method="POST"
										action="?/updatePersonalDetails"
										class="space-y-4"
									>
										<div class="grid grid-cols-2 gap-4">
											<div class="space-y-2">
												<Label for="firstName">First Name</Label>
												<Input
													id="firstName"
													name="firstName"
													value={candidate.user.firstName}
													placeholder="Enter first name"
												/>
											</div>
											<div class="space-y-2">
												<Label for="lastName">Last Name</Label>
												<Input
													id="lastName"
													name="lastName"
													value={candidate.user.lastName}
													placeholder="Enter last name"
												/>
											</div>
										</div>

										<div class="space-y-2">
											<Label for="email">Email</Label>
											<Input
												id="email"
												name="email"
												type="email"
												value={candidate.user.email}
												placeholder="Enter email address"
											/>
										</div>

										<div class="space-y-2">
											<Label for="cellPhone">Cell Phone</Label>
											<PhoneInput
												id="cellPhone"
												name="cellPhone"
												value={candidate.profile.cellPhone}
												placeholder="Enter cell phone"
											/>
										</div>
										<div class="space-y-2">
											<div class="space-y-2">
												<Label for="completeAddress">Complete Address</Label>
												{#if candidate.profile.completeAddress}
													<p class="text-xs text-muted-foreground">
														Current: <span class="text-foreground"
															>{candidate.profile.completeAddress}</span
														>
													</p>
												{/if}
												<AddressSearchAutocomplete
													bind:selected={selectedAddress}
													on:select={handleAddressSelect}
													on:clear={handleClear}
													placeholder={candidate.profile.completeAddress
														? 'Start typing to change address...'
														: 'Search for an address...'}
													country="us"
													maxResults={8}
												/>
												<input
													type="hidden"
													name="completeAddress"
													value={selectedAddress?.formatted_address || ''}
												/>
												<input
													type="hidden"
													name="lat"
													value={selectedAddress?.coordinates.lat || ''}
												/>
												<input
													type="hidden"
													name="lon"
													value={selectedAddress?.coordinates.lng || ''}
												/>
											</div>
											<Label for="birthday">Date of Birth</Label>
											<Input
												id="birthday"
												name="birthday"
												type="date"
												value={candidate.profile.birthday}
											/>
										</div>

										<div class="space-y-2">
											<Label for="workersCompCode">Workers' Comp Code</Label>
											<Input
												id="workersCompCode"
												name="workersCompCode"
												value={candidate.profile.workersCompCode ?? ''}
												placeholder="e.g., 8021..."
											/>
										</div>

										<div class="flex gap-2 pt-4">
											<Button
												type="submit"
												size="sm"
												disabled={$detailsSubmitting}
												class="gap-2 bg-green-500 hover:bg-green-600 text-white"
											>
												<Save class="h-4 w-4" />
												{#if $detailsSubmitting}
													Saving...
												{:else}
													Save changes
												{/if}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												on:click={() => cancelEdit('personal')}
												class="gap-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-500"
											>
												<X class="h-4 w-4" />
												Cancel
											</Button>
										</div>
									</form>
								{:else}
									<!-- Personal Details Display -->
									<div class="space-y-4">
										<div>
											<h3 class="text-sm font-medium text-muted-foreground">Contact Information</h3>
											<div class="mt-2 space-y-2">
												<div class="flex items-center gap-2">
													<Mail class="h-4 w-4 text-gray-500" />
													<a
														href={`mailto:${candidate.user.email}`}
														class="text-blue-600 hover:underline"
													>
														{candidate.user.email}
													</a>
												</div>
												<div class="flex items-center gap-2">
													<Phone class="h-4 w-4 text-gray-500" />
													<a
														href={`tel:${candidate.profile.cellPhone}`}
														class="text-blue-600 hover:underline"
													>
														{candidate.profile.cellPhone}
													</a>
												</div>
											</div>
										</div>

										{#if isAdmin}
											<div>
												<h3 class="text-sm font-medium text-muted-foreground">Address</h3>
												<address class="mt-1 not-italic">
													{candidate.profile.completeAddress || 'None specified'}
												</address>
											</div>
										{/if}

										<div>
											<h3 class="text-sm font-medium text-muted-foreground">Date of Birth</h3>
											<p class="mt-1">{format(birthdate, 'P')}</p>
										</div>

										{#if isAdmin}
											<div>
												<h3 class="text-sm font-medium text-muted-foreground">Workers' Comp Code</h3>
												<p class="mt-1">{candidate.profile.workersCompCode || 'None specified'}</p>
											</div>
										{/if}
									</div>
								{/if}
							</CardContent>
						</Card>

						<!-- Work Preferences Card -->
						<Card class="w-full max-w-none">
							<CardHeader class="pb-3">
								<div class="flex items-center justify-between">
									<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
										<Briefcase class="h-4 w-4" />
										Work Details & Preferences
									</CardTitle>
									{#if !editingDisciplines && isAdmin}
										<Button variant="ghost" size="sm" on:click={startEditingDisciplines}>
											<Edit class="h-4 w-4" />
										</Button>
									{/if}
								</div>
							</CardHeader>
							<CardContent class="pt-0">
								{#if editingDisciplines}
									<!-- Discipline Edit Form -->
									<form
										method="POST"
										action="?/updateDisciplines"
										use:disciplinesEnhance
										class="space-y-4"
									>
										{#if $disciplinesErrors._errors?.length}
											<Alert.Root variant="destructive">
												<AlertCircle class="h-4 w-4" />
												<Alert.Description>
													{$disciplinesErrors._errors[0]}
												</Alert.Description>
											</Alert.Root>
										{/if}

										<!-- Add New Discipline Section -->
										<div class="border rounded-lg p-4 bg-gray-50">
											<h4 class="text-sm font-medium mb-3">Add New Discipline</h4>

											<div class="grid gap-3">
												<div>
													<Label>Select Discipline</Label>
													<Select.Root
														selected={selectedNewDisciplineId
															? {
																	value: selectedNewDisciplineId,
																	label: getDisciplineName(selectedNewDisciplineId)
																}
															: undefined}
														onSelectedChange={(value) =>
															(selectedNewDisciplineId = value?.value || '')}
													>
														<Select.Trigger class="mt-1.5">
															<Select.Value placeholder="Select a discipline" />
														</Select.Trigger>
														<Select.Content>
															{#each availableDisciplinesFiltered as discipline}
																<Select.Item value={discipline.id}>
																	{discipline.name}
																</Select.Item>
															{/each}
														</Select.Content>
													</Select.Root>
												</div>

												<div>
													<Label>Experience Level</Label>
													<Select.Root
														selected={selectedNewExperienceLevelId
															? {
																	value: selectedNewExperienceLevelId,
																	label: getExperienceLevelName(selectedNewExperienceLevelId)
																}
															: undefined}
														onSelectedChange={(value) =>
															(selectedNewExperienceLevelId = value?.value || '')}
													>
														<Select.Trigger class="mt-1.5">
															<Select.Value placeholder="Select experience level" />
														</Select.Trigger>
														<Select.Content>
															{#each data.experienceLevels as level}
																<Select.Item value={level.id}>{level.value}</Select.Item>
															{/each}
														</Select.Content>
													</Select.Root>
												</div>

												<div class="grid grid-cols-2 gap-3">
													<div>
														<Label>Min Rate ($/hr)</Label>
														<div class="relative mt-1.5">
															<DollarSign
																class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
															/>
															<Input
																type="number"
																min="0"
																bind:value={newDisciplineMinRate}
																class="pl-9"
																placeholder="0"
															/>
														</div>
													</div>
													<div>
														<Label>Max Rate ($/hr)</Label>
														<div class="relative mt-1.5">
															<DollarSign
																class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
															/>
															<Input
																type="number"
																min="0"
																bind:value={newDisciplineMaxRate}
																class="pl-9"
																placeholder="0"
															/>
														</div>
													</div>
												</div>

												<Button
													type="button"
													variant="outline"
													size="sm"
													on:click={addNewDiscipline}
													disabled={!selectedNewDisciplineId || !selectedNewExperienceLevelId}
												>
													Add Discipline
												</Button>
											</div>
										</div>

										<!-- Current Disciplines -->
										<div>
											<h4 class="text-sm font-medium mb-3">
												Current Disciplines ({$disciplinesFormData.disciplines.length})
											</h4>

											{#if $disciplinesFormData.disciplines.length === 0}
												<div class="border rounded-md p-8 text-center">
													<p class="text-sm text-gray-500">No disciplines added</p>
												</div>
											{:else}
												<div class="space-y-3">
													{#each $disciplinesFormData.disciplines as discipline, index}
														<input
															type="hidden"
															name={`disciplines[${index}].disciplineId`}
															value={discipline.disciplineId}
														/>
														<input
															type="hidden"
															name={`disciplines[${index}].experienceLevelId`}
															value={discipline.experienceLevelId}
														/>
														<input
															type="hidden"
															name={`disciplines[${index}].preferredHourlyMin`}
															value={discipline.preferredHourlyMin}
														/>
														<input
															type="hidden"
															name={`disciplines[${index}].preferredHourlyMax`}
															value={discipline.preferredHourlyMax}
														/>

														<div class="border rounded-lg p-3 bg-white">
															<div class="flex items-start gap-3">
																<div class="flex-1 grid gap-3">
																	<div>
																		<p class="font-medium text-sm">
																			{getDisciplineName(discipline.disciplineId)}
																		</p>
																	</div>

																	<div class="grid md:grid-cols-3 gap-3">
																		<div>
																			<Label class="text-xs">Experience Level</Label>
																			<Select.Root
																				selected={{
																					value: discipline.experienceLevelId,
																					label: getExperienceLevelName(
																						discipline.experienceLevelId
																					)
																				}}
																				onSelectedChange={(value) => {
																					if (value) {
																						$disciplinesFormData.disciplines[
																							index
																						].experienceLevelId = value.value;
																					}
																				}}
																			>
																				<Select.Trigger class="h-9 mt-1">
																					<Select.Value />
																				</Select.Trigger>
																				<Select.Content>
																					{#each data.experienceLevels as level}
																						<Select.Item value={level.id}>{level.value}</Select.Item
																						>
																					{/each}
																				</Select.Content>
																			</Select.Root>
																		</div>

																		<div>
																			<Label class="text-xs">Min Rate</Label>
																			<Input
																				type="number"
																				min="0"
																				bind:value={discipline.preferredHourlyMin}
																				class="h-9 mt-1"
																			/>
																		</div>

																		<div>
																			<Label class="text-xs">Max Rate</Label>
																			<Input
																				type="number"
																				min="0"
																				bind:value={discipline.preferredHourlyMax}
																				class="h-9 mt-1"
																			/>
																		</div>
																	</div>
																</div>

																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	class="h-8 w-8 text-gray-400 hover:text-red-600"
																	on:click={() => removeDisciplineFromEdit(discipline.disciplineId)}
																>
																	<X class="h-4 w-4" />
																</Button>
															</div>
														</div>
													{/each}
												</div>
											{/if}
										</div>

										<div class="flex gap-2 pt-4">
											<Button
												type="submit"
												size="sm"
												disabled={$disciplinesSubmitting}
												class="gap-2 bg-green-500 hover:bg-green-600 text-white"
											>
												<Save class="h-4 w-4" />
												{#if $disciplinesSubmitting}
													Saving...
												{:else}
													Save Changes
												{/if}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												on:click={cancelDisciplineEdit}
												class="gap-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-500"
											>
												<X class="h-4 w-4" />
												Cancel
											</Button>
										</div>
									</form>
								{:else}
									<!-- Work Preferences Display (keep existing) -->
									<div class="space-y-4">
										<div>
											<h3 class="text-sm font-medium text-muted-foreground mb-3">
												Experience & Rates
											</h3>
											<div class="flex flex-col gap-3">
												{#each disciplines as discipline}
													<div class="border rounded-lg p-3 bg-gray-50">
														<div class="flex items-start justify-between gap-4">
															<div class="flex-1">
																<p class="font-medium text-sm text-gray-900">
																	{discipline.discipline.name}
																</p>
																<p class="text-xs text-gray-600 mt-1">
																	{discipline.experience.experienceLevel}
																</p>
															</div>
															<div class="text-right flex-shrink-0">
																<div
																	class="flex items-center gap-1 text-sm font-medium text-gray-900"
																>
																	<DollarSign class="h-4 w-4 text-gray-500" />
																	<span>
																		{discipline.salaryRange.min || 0} - {discipline.salaryRange
																			.max || 0}/hr
																	</span>
																</div>
															</div>
														</div>
													</div>
												{/each}
											</div>
										</div>
									</div>
								{/if}
							</CardContent>
						</Card>
						{#if isAdmin}
							<Card class="w-full max-w-none">
								<CardHeader class="pb-3">
									<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
										<MessageSquare class="h-4 w-4" />
										Admin Notes
									</CardTitle>
								</CardHeader>
								<CardContent class="pt-0">
									<AdminProfileComments
										comments={data.comments}
										currentUserId={user.id}
										addAction="?/addComment"
										deleteAction="?/deleteComment"
									/>
								</CardContent>
							</Card>
						{/if}
					</div>
				</TabsContent>

				<!-- Availability Tab -->
				<!-- <TabsContent value="availability" class="mt-6">
                    <Card class="w-full max-w-none">
                        <CardHeader class="pb-3">
                            <CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
                                <CalendarIcon class="h-4 w-4" />
                                Availability Schedule
                            </CardTitle>
                        </CardHeader>
                        <CardContent class="pt-0">
                            <Calendar events={[]} />
                        </CardContent>
                    </Card>
                </TabsContent> -->

				<!-- Documents Tab -->
				<TabsContent value="documents" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="pb-3 flex-row flex-wrap justify-between items-center">
							<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
								<FileText class="h-4 w-4" />
								Documents
							</CardTitle>
							<Dialog>
								<DialogTrigger>
									<Button class="bg-blue-500 hover:bg-blue-600 gap-2"><Plus />Upload</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Upload Documents</DialogTitle>
									</DialogHeader>
									<div class="space-y-4">
										<form
											id="documents-form"
											use:docsEnhance
											method="POST"
											action="?/documentsUpload"
											class="mt-6"
										>
											<div class="space-y-2">
												<input type="hidden" name="urls" bind:value={urlStrings} />
												<input type="hidden" name="filesData" bind:value={fileStrings} />
												<FileDropzone
													onFileDrop={handleDocumentsUpload}
													accept={['image/*', '.jpg', '.png', '.pdf', '.doc', '.docx', '.txt']}
													maxSizeMB={10}
													multiple={true}
												/>
												{#if $docsErrors._errors?.length}
													<Alert.Root variant="destructive">
														<AlertCircle class="h-4 w-4" />
														<Alert.Title>Error</Alert.Title>
														<Alert.Description>
															{$docsErrors._errors[0]}
														</Alert.Description>
													</Alert.Root>
												{/if}
											</div>
										</form>
										<Separator />
										<div class="space-y-2">
											<h3 class="text-sm font-medium">File Requirements</h3>
											<ul class="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
												<li>Files must be in PDF, JPG, or PNG format</li>
												<li>Maximum file size is 5MB</li>
												<li>Documents must be clearly legible</li>
											</ul>
										</div>
									</div>
								</DialogContent>
							</Dialog>
						</CardHeader>
						<CardContent class="pt-0">
							{#if documents.length > 0}
								{#each documents as doc}
									<tr class="border-b hover:bg-gray-50">
										<td class="py-3 px-4">
											<div class="flex items-center gap-2">
												{#if doc.adminOnly}
													<Lock class="h-5 w-5 text-red-600" />
												{/if}
												{#if getFileIcon(doc?.filename) === 'image'}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-5 w-5 text-blue-600"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
													>
														<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
														<circle cx="8.5" cy="8.5" r="1.5" />
														<polyline points="21 15 16 10 5 21" />
													</svg>
												{:else if getFileIcon(doc?.filename) === 'pdf'}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-5 w-5 text-red-600"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
													>
														<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
														<polyline points="14 2 14 8 20 8" />
														<path d="M9 15v-2" />
														<path d="M12 15v-4" />
														<path d="M15 15v-6" />
													</svg>
												{:else}
													<FileText class="h-5 w-5 text-blue-600" />
												{/if}
												<span class="font-medium">{doc?.filename}</span>
											</div>
										</td>
										<td class="py-3 px-4 text-sm">{format(doc.createdAt, 'PP')}</td>
										<td class="py-3 px-4 text-right">
											<DropdownMenu>
												<DropdownMenuTrigger>
													<Button variant="ghost" size="icon">
														<MoreHorizontal class="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem>
														<a
															class="flex"
															href={doc.uploadUrl}
															target="_blank"
															rel="noopener noreferrer"
														>
															<Download class="h-4 w-4 mr-2" />
															<span>Download</span>
														</a>
													</DropdownMenuItem>
													<DropdownMenuItem class="cursor-pointer">
														<form
															action="?/toggleAdminDocumentLock"
															method="post"
															use:enhance
															class="w-full"
														>
															<input type="hidden" name="documentId" value={doc.id} />
															<button type="submit" class="flex items-center w-full text-left">
																{#if doc.adminOnly}
																	<Unlock class="h-4 w-4 mr-2" />
																{:else}
																	<Lock class="h-4 w-4 mr-2" />
																{/if}
																<span>{doc.adminOnly ? 'Unlock ' : 'Lock '}</span>
															</button>
														</form>
													</DropdownMenuItem>
													<DropdownMenuItem class="text-red-600 cursor-pointer">
														<form
															action="?/deleteDocument"
															method="post"
															use:enhance
															class="w-full"
														>
															<input type="hidden" name="documentId" value={doc.id} />
															<button type="submit" class="flex items-center w-full text-left">
																<Trash class="h-4 w-4 mr-2" />
																<span>Delete</span>
															</button>
														</form>
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</td>
									</tr>
								{/each}
							{:else}
								<div class="text-center py-8">
									<FileText class="h-12 w-12 mx-auto text-gray-300" />
									<h3 class="mt-4 text-lg font-medium">No Documents</h3>
									<p class="mt-2 text-sm text-gray-500">No documents have been uploaded yet.</p>
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>

				<!-- Work History Tab -->
				<TabsContent value="work-history" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="pb-3">
							<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
								<Clock class="h-4 w-4" />
								Work History
							</CardTitle>
						</CardHeader>
						<CardContent class="pt-0">
							{#if workHistory.length > 0}
								<div class="overflow-x-auto">
									<table class="w-full border-collapse">
										<thead>
											<tr class="border-b">
												<th class="text-left py-3 px-4 font-medium">Date</th>
												<th class="text-left py-3 px-4 font-medium">Position</th>
												<th class="text-left py-3 px-4 font-medium">Client</th>
												<th class="text-left py-3 px-4 font-medium">Hours</th>
												<th class="text-left py-3 px-4 font-medium">Timesheet</th>
												<!-- <th class="text-right py-3 px-4 font-medium">Actions</th> -->
											</tr>
										</thead>
										<tbody>
											{#each workHistory as shift}
												<!-- {@const statusBadge = getStatusBadge(shift.status)} -->

												<tr class="border-b hover:bg-gray-50">
													<td class="py-4 px-4">
														<div class="text-xs">
															{format(shift.recurrenceDay.dayStart, 'PP')}
														</div>
														<!-- <div class="text-xs text-muted-foreground">
                                                        {format(shift.recurrenceDay.dayStart, 'hh:mm a')} -{' '}
                                                        {format(shift.recurrenceDay.dayEnd, 'hh:mm a')}
                                                    </div> -->
													</td>

													<td class="py-4 px-4">{shift.requisition.title}</td>

													<td class="py-4 px-4">
														<div>{shift.requisition.companyName}</div>
														<div class="text-xs text-muted-foreground truncate max-w-[200px]">
															{shift.location.address1}
															{shift.location.address2 || ''}
															{shift.location.city}, {shift.location.state}
															{shift.location.zip}
														</div>
													</td>

													<td class="py-4 px-4">{shift.timesheet?.totalHoursWorked}</td>
													<td class="py-4 px-4">
														{#if shift.timesheet}
															<Button
																variant="outline"
																href={`/timesheets/${shift.timesheet?.id}`}
																size="sm"
																>View Timesheet
															</Button>
														{:else}
															<Button variant="outline" href="/timesheets/new" size="sm"
																>Create Timesheet
															</Button>
														{/if}
													</td>
													<!-- <td class="py-4 px-4 text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        href={`/my-shifts/${shift.workday.id}`}
                                                    >
                                                        View Details
                                                    </Button>
                                                </td> -->
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{:else}
								<div class="text-center py-8">
									<Clock class="h-12 w-12 mx-auto text-gray-300" />
									<h3 class="mt-4 text-lg font-medium">No Work History</h3>
									<p class="mt-2 text-sm text-gray-500">No work history records found.</p>
								</div>
							{/if}
						</CardContent>
					</Card>
				</TabsContent>

				<!-- Support Tickets Tab -->
				<TabsContent value="support" class="mt-6">
					<Card class="w-full max-w-none">
						<CardHeader class="pb-3">
							<CardTitle class="text-blue-600 flex items-center gap-2 text-lg">
								<Mail class="h-4 w-4" />
								Support Tickets
							</CardTitle>
						</CardHeader>
						<CardContent class="pt-0">
							<div class="text-center py-8">
								<Mail class="h-12 w-12 mx-auto text-gray-300" />
								<h3 class="mt-4 text-lg font-medium">No Support Tickets</h3>
								<p class="mt-2 text-sm text-gray-500">No support tickets have been created.</p>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	</section>
{:else}
	<section
		class="container mx-auto px-4 py-6 flex flex-col items-center text-center sm:justify-center gap-4 md:gap-6"
	>
		<div class="p-8 bg-gray-50 rounded-lg">
			<AlertCircle class="h-12 w-12 mx-auto text-gray-400 mb-4" />
			<h2 class="text-2xl font-bold mb-2">No Professional Member Found</h2>
			<p class="text-gray-500 mb-6">
				The requested professional member could not be found in our system.
			</p>
			<Button type="button" on:click={() => window.history.back()}>Go Back</Button>
		</div>
	</section>
{/if}
