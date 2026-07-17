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
		enhance,
		submitting,
		reset,
		isTainted
	} = superForm(form, {
		clearOnSubmit: 'errors-and-message',
		resetForm: true
	});

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
			<Label for="clientId">Associated Client</Label>
			<Popover.Root bind:open={openClient} let:ids>
				<Popover.Trigger asChild let:builder>
					<Button
						builders={[builder]}
						variant="outline"
						role="combobox"
						aria-expanded={openClient}
						class="w-full justify-between"
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
		</div>

		<!-- Location Combobox -->
		<div class="mb-4">
			<Label for="locationId">Location</Label>
			<Popover.Root bind:open={openLocation} let:ids>
				<Popover.Trigger asChild let:builder>
					<Button
						builders={[builder]}
						variant="outline"
						role="combobox"
						aria-expanded={openLocation}
						class="w-full justify-between"
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
		</div>

		<!-- Discipline Combobox -->
		<div class="mb-4">
			<Label for="disciplineId">Discipline</Label>
			<Popover.Root bind:open={openDiscipline} let:ids>
				<Popover.Trigger asChild let:builder>
					<Button
						builders={[builder]}
						variant="outline"
						role="combobox"
						aria-expanded={openDiscipline}
						class="w-full justify-between"
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
				required
			>
				<option value={false}>Temporary</option>
				<option value={true}>Permanent</option>
			</select>
		</div>

		<div class="mb-4">
			<Label for="hourlyRate">Hourly Rate</Label>
			<Input
				type="number"
				id="hourlyRate"
				name="hourlyRate"
				bind:value={$formObj.hourlyRate}
				tabindex={drawerExpanded ? 0 : -1}
				required
			/>
		</div>

		<div class="mb-4">
			<Label for="purchaseOrderNumber">Purchase Order #</Label>
			<Input
				type="text"
				id="purchaseOrderNumber"
				name="purchaseOrderNumber"
				bind:value={$formObj.purchaseOrderNumber}
				tabindex={drawerExpanded ? 0 : -1}
				required
			/>
		</div>

		<div class="mb-4">
			<Label for="jobDescription">Job Description</Label>
			<textarea
				id="jobDescription"
				name="jobDescription"
				bind:value={$formObj.jobDescription}
				class="w-full p-2 border rounded"
				rows="4"
				tabindex={drawerExpanded ? 0 : -1}
				required
			></textarea>
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
