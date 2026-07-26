<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { AdminRequisitionSchema } from '$lib/config/zod-schemas';
	import { superForm } from 'sveltekit-superforms/client';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { onMount, onDestroy } from 'svelte';
	import { Check, ChevronsUpDown } from 'lucide-svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';

	export let form: SuperValidated<AdminRequisitionSchema>;
	export let drawerExpanded: boolean;
	export let currentCompanyID: string | null = null;

	let openClient = false;
	let openLocation = false;
	let openDiscipline = false;

	let clients: any[] = [];
	let locations: any[] = [];
	let disciplines: any[] = [];
	let experienceLevels: any[] = [];
	let selectedLocation = null;
	let selectedCompany: {
		value: string;
		label: string;
		sublabel: string;
	} | null = null;
	let selectedDiscipline = null;

	$: sortedExperienceLevels = [...experienceLevels].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0)
	);

	const {
		form: formObj,
		errors,
		enhance,
		submitting,
		reset,
		isTainted
	} = superForm(form, {
		// Validate only the user-facing required fields here (not the whole schema)
		// so submit stays reliable — superforms v1's full-schema client validation
		// chokes on the number/boolean coercions of this form. Cancels the POST and
		// shows inline errors when something required is missing.
		onSubmit: ({ cancel }) => {
			if (!validateRequiredFields()) cancel();
		},
		clearOnSubmit: 'errors-and-message',
		resetForm: true
	});

	// Populates the shared `errors` store used by the inline error markup; returns
	// true when the form is good to submit.
	function validateRequiredFields(): boolean {
		const e: Record<string, string[]> = {};
		if (!$formObj.clientId) e.clientId = ['Please select a client'];
		if (!$formObj.locationId) e.locationId = ['Please select a location'];
		if (!$formObj.disciplineId) e.disciplineId = ['Please select a discipline'];
		const rate = Number($formObj.hourlyRate);
		if (
			$formObj.hourlyRate == null ||
			String($formObj.hourlyRate).trim() === '' ||
			isNaN(rate) ||
			rate <= 0
		) {
			e.hourlyRate = ['Enter a valid hourly rate'];
		}
		if (!$formObj.jobDescription || !$formObj.jobDescription.trim()) {
			e.jobDescription = ['Job description is required'];
		}
		$errors = e as typeof $errors;
		return Object.keys(e).length === 0;
	}

	$: if (currentCompanyID && clients.length) {
		$formObj.clientId = currentCompanyID;

		// Find and set the selected company for display
		const client = clients.find((c) => c.company.id === currentCompanyID);
		if (client) {
			console.log('Found client for currentCompanyID:', client);
			selectedCompany = {
				value: client.company.id,
				label: client.company.companyName,
				sublabel: `${client.user.lastName}, ${client.user.firstName}`
			};
		}

		handleGetLocations(currentCompanyID);
	}

	const handleFetchClients = async () => {
		if (!clients.length) {
			const req = await fetch('/api/admin/fetchAllClients', { method: 'GET' });
			const clientsRes = await req.json();
			clients = clientsRes.sort((a, b) =>
				a.company.companyName.localeCompare(b.company.companyName)
			);
		}
	};

	const handleGetLocations = async (companyId: string) => {
		if (!companyId?.length) {
			locations = [];
			return;
		}
		const req = await fetch(`/api/admin/fetchCompanyLocations?companyId=${companyId}`, {
			method: 'GET'
		});
		const locationsRes = await req.json();
		locations = locationsRes;

		// Auto-select if only one location
		if (locations.length === 1) {
			$formObj.locationId = locations[0].id;
			selectedLocation = locations[0];
			$formObj.timezone = locations[0].timezone;
		}
	};

	const handleFetchDisciplines = async () => {
		if (!disciplines.length) {
			const req = await fetch('/api/disciplines/fetchAllDisciplines', { method: 'GET' });
			const disciplinesRes = await req.json();
			disciplines = disciplinesRes;
		}
	};

	const handleFetchExperienceLevels = async () => {
		if (!experienceLevels.length) {
			const req = await fetch('/api/experience/fetchAllExperienceLevels', { method: 'GET' });
			const experienceRes = await req.json();
			experienceLevels = experienceRes;
		}
	};

	onMount(async () => {
		await handleFetchClients();
		await handleFetchDisciplines();
		await handleFetchExperienceLevels();
		if (currentCompanyID) {
			$formObj.clientId = currentCompanyID;
			await handleGetLocations(currentCompanyID);
		}

		window.addEventListener('beforeunload', handleBeforeUnload);
	});

	onDestroy(() => {
		window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	function handleReset() {
		reset();
		locations = [];
		selectedLocation = null;
		selectedCompany = null;
		selectedDiscipline = null;
	}

	function handleDrawerClose() {
		handleReset();
		drawerExpanded = false;
	}

	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if (isTainted()) {
			event.preventDefault();
			event.returnValue = '';
		}
	}

	function closeAndFocusTrigger(triggerId: string) {
		tick().then(() => {
			document.getElementById(triggerId)?.focus();
		});
	}

	$: if (!drawerExpanded) {
		handleReset();
	}

	$: if ($formObj.locationId) {
		selectedLocation = locations.find((location) => location.id === $formObj.locationId);
		if (selectedLocation) {
			$formObj.timezone = selectedLocation.timezone;
		}
	}

	$: console.log({ currentCompanyID, selectedCompany });
</script>

<form
	use:enhance
	method="POST"
	action="/requisitions?/admin"
	class="grow flex flex-col h-full max-h-[calc(100vh_-_70px)]"
>
	<input type="hidden" bind:value={$formObj.timezone} name="timezone" />
	<input type="hidden" bind:value={$formObj.clientId} name="clientId" />
	<input type="hidden" bind:value={$formObj.locationId} name="locationId" />
	<input type="hidden" bind:value={$formObj.disciplineId} name="disciplineId" />

	<div class="grow p-4 overflow-y-auto">
		<!-- Associated Client Combobox -->
		<div class="mb-4">
			<Label for="clientId">Associated Client <span class="text-red-600">*</span></Label>
			<Popover.Root bind:open={openClient} let:ids>
				<Popover.Trigger asChild let:builder>
					<Button
						builders={[builder]}
						variant="outline"
						role="combobox"
						aria-expanded={openClient}
						class={cn('w-full justify-between', $errors.clientId && 'border-red-500')}
						tabindex={drawerExpanded ? 0 : -1}
					>
						{selectedCompany?.label ?? 'Select Client'}
						<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content class="p-0 max-h-[300px] overflow-auto" align="start" sameWidth>
					<Command.Root>
						<Command.Input placeholder="Search client..." />
						<Command.Empty>No Client Found.</Command.Empty>
						<Command.Group>
							{#each clients as client}
								<Command.Item
									value={`${client.company.companyName} ${client.user.lastName} ${client.user.firstName}`}
									onSelect={() => {
										$formObj.clientId = client.company.id;
										handleGetLocations(client.company.id);
										selectedCompany = {
											value: client.company.id,
											label: client.company.companyName,
											sublabel: `${client.user.lastName}, ${client.user.firstName}`
										};
										openClient = false;
										closeAndFocusTrigger(ids.trigger);
									}}
								>
									<Check
										class={cn(
											'mr-2 h-4 w-4',
											$formObj.clientId !== client.company.id && 'text-transparent'
										)}
									/>
									<div class="flex flex-col">
										<span>{client.company.companyName}</span>
										<span class="text-sm text-muted-foreground">
											{client.user.lastName}, {client.user.firstName}
										</span>
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
			{#if $errors.clientId}<p class="text-xs text-red-600 mt-1">{$errors.clientId}</p>{/if}
		</div>

		<!-- Location Combobox -->
		<div class="mb-4">
			<Label for="locationId">Location <span class="text-red-600">*</span></Label>
			<Popover.Root bind:open={openLocation} let:ids>
				<Popover.Trigger asChild let:builder>
					<Button
						builders={[builder]}
						variant="outline"
						role="combobox"
						aria-expanded={openLocation}
						class={cn('w-full justify-between', $errors.locationId && 'border-red-500')}
						tabindex={drawerExpanded ? 0 : -1}
						disabled={!locations.length}
					>
						{selectedLocation?.name ?? 'Select Location'}
						<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content class="p-0  max-h-[300px] overflow-auto" align="start" sameWidth>
					<Command.Root>
						<Command.Input placeholder="Search location..." />
						<Command.Empty>No Location Found.</Command.Empty>
						<Command.Group>
							{#each locations as location}
								<Command.Item
									value={location.name}
									onSelect={() => {
										$formObj.locationId = location.id;
										selectedLocation = location;
										$formObj.timezone = location.timezone;
										console.log('location.timezone:', location.timezone);
										console.log('formObj.timezone:', $formObj.timezone);
										openLocation = false;
										closeAndFocusTrigger(ids.trigger);
									}}
								>
									<Check
										class={cn(
											'mr-2 h-4 w-4',
											$formObj.locationId !== location.id && 'text-transparent'
										)}
									/>
									{location.name}
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
			{#if $errors.locationId}<p class="text-xs text-red-600 mt-1">{$errors.locationId}</p>{/if}
		</div>

		<!-- Discipline Combobox -->
		<div class="mb-4">
			<Label for="disciplineId">Discipline <span class="text-red-600">*</span></Label>
			<Popover.Root bind:open={openDiscipline} let:ids>
				<Popover.Trigger asChild let:builder>
					<Button
						builders={[builder]}
						variant="outline"
						role="combobox"
						aria-expanded={openDiscipline}
						class={cn('w-full justify-between', $errors.disciplineId && 'border-red-500')}
						tabindex={drawerExpanded ? 0 : -1}
					>
						{selectedDiscipline?.name ?? 'Select Discipline'}
						<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
					</Button>
				</Popover.Trigger>
				<Popover.Content class="p-0 max-h-[300px] overflow-auto" align="start" sameWidth>
					<Command.Root>
						<Command.Input placeholder="Search discipline..." />
						<Command.Empty>No Discipline Found.</Command.Empty>
						<Command.Group>
							{#each disciplines as discipline}
								<Command.Item
									value={discipline.name}
									onSelect={() => {
										$formObj.disciplineId = discipline.id;
										selectedDiscipline = discipline;
										openDiscipline = false;
										closeAndFocusTrigger(ids.trigger);
									}}
								>
									<Check
										class={cn(
											'mr-2 h-4 w-4',
											$formObj.disciplineId !== discipline.id && 'text-transparent'
										)}
									/>
									{discipline.name}
								</Command.Item>
							{/each}
						</Command.Group>
					</Command.Root>
				</Popover.Content>
			</Popover.Root>
			{#if $errors.disciplineId}<p class="text-xs text-red-600 mt-1">{$errors.disciplineId}</p>{/if}
		</div>

		<!-- Experience Level (native select) -->
		<div class="mb-4">
			<Label for="experienceLevelId">Experience Level</Label>
			<select
				id="experienceLevelId"
				name="experienceLevelId"
				bind:value={$formObj.experienceLevelId}
				class="w-full p-2 border rounded"
			>
				<option value="">No Preference</option>
				{#each sortedExperienceLevels as level}
					<option value={level.id}>{level.value}</option>
				{/each}
			</select>
		</div>

		<!-- Requisition Type - kept as native select -->
		<div class="mb-4">
			<Label for="permanentPosition">Requisition Type</Label>
			<select
				id="permanentPosition"
				name="permanentPosition"
				bind:value={$formObj.permanentPosition}
				class="w-full p-2 border rounded"
				tabindex={drawerExpanded ? 0 : -1}
			>
				<option value={false}>Temporary</option>
				<option value={true}>Permanent</option>
			</select>
		</div>

		<div class="mb-4">
			<Label for="hourlyRate">Hourly Rate <span class="text-red-600">*</span></Label>
			<Input
				type="number"
				id="hourlyRate"
				name="hourlyRate"
				bind:value={$formObj.hourlyRate}
				tabindex={drawerExpanded ? 0 : -1}
				class={$errors.hourlyRate ? 'border-red-500' : ''}
			/>
			{#if $errors.hourlyRate}<p class="text-xs text-red-600 mt-1">{$errors.hourlyRate}</p>{/if}
		</div>

		<div class="mb-4">
			<Label for="purchaseOrderNumber">Purchase Order #</Label>
			<Input
				type="text"
				id="purchaseOrderNumber"
				name="purchaseOrderNumber"
				bind:value={$formObj.purchaseOrderNumber}
				tabindex={drawerExpanded ? 0 : -1}
			/>
		</div>

		<div class="mb-4">
			<Label for="jobDescription">Job Description <span class="text-red-600">*</span></Label>
			<textarea
				id="jobDescription"
				name="jobDescription"
				bind:value={$formObj.jobDescription}
				class={cn('w-full p-2 border rounded', $errors.jobDescription && 'border-red-500')}
				rows="4"
				tabindex={drawerExpanded ? 0 : -1}
			></textarea>
			{#if $errors.jobDescription}<p class="text-xs text-red-600 mt-1">{$errors.jobDescription}</p>{/if}
		</div>

		<div class="mb-4">
			<Label for="specialInstructions">Special Instructions</Label>
			<textarea
				id="specialInstructions"
				name="specialInstructions"
				bind:value={$formObj.specialInstructions}
				class="w-full p-2 border rounded"
				rows="4"
				tabindex={drawerExpanded ? 0 : -1}
			></textarea>
		</div>
	</div>

	<div class="flex justify-end gap-4 p-4 border-t border-t-gray-200">
		<Button
			tabindex={drawerExpanded ? 0 : -1}
			type="button"
			on:click={handleDrawerClose}
			class="bg-white hover:bg-destructive/90 hover:text-white border border-red-500 text-red-500 rounded-md"
		>
			Cancel
		</Button>
		<Button
			tabindex={drawerExpanded ? 0 : -1}
			type="submit"
			disabled={$submitting}
			class="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md"
		>
			{#if $submitting}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				Please wait
			{:else}
				Create Requisition
			{/if}
		</Button>
	</div>
</form>
