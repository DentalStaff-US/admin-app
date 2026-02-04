<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { AdminRequisitionSchema } from '$lib/config/zod-schemas';
	import { superForm } from 'sveltekit-superforms/client';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { onMount, onDestroy } from 'svelte';

	export let form: SuperValidated<AdminRequisitionSchema>;
	export let drawerExpanded: boolean;
	export let currentCompanyID: string | null = null;

	let clients: any[] = [];
	let locations: any[] = [];
	let disciplines: any[] = [];
	let experienceLevels: any[] = [];
	let selectedLocation = null;

	$: sortedExperienceLevels = [...experienceLevels].sort((a, b) => {
		const priorityMap = {
			'0-2 Years': 1,
			'2-5 Years': 2,
			'5-7 Years': 3,
			'7-10 Years': 4,
			'10+ years': 5
		};

		const priorityA = priorityMap[a.value] || 999;
		const priorityB = priorityMap[b.value] || 999;

		return priorityA - priorityB;
	});

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

	$: if (currentCompanyID) {
		$formObj.clientId = currentCompanyID;
		handleGetLocations(currentCompanyID);
	}

	const handleFetchClients = async () => {
		if (!clients.length) {
			const req = await fetch('/api/admin/fetchAllClients', { method: 'GET' });
			const clientsRes = await req.json();
			clients = clientsRes;
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

	$: if (!drawerExpanded) {
		handleReset();
	}

	$: if ($formObj.locationId) {
		selectedLocation = locations.find((location) => location.id === $formObj.locationId);
		if (selectedLocation) {
			$formObj.timezone = selectedLocation.timezone;
		}
	}

	$: console.log({ formData: $formObj });
</script>

<form
	use:enhance
	method="POST"
	action="/requisitions?/admin"
	class="grow flex flex-col h-full max-h-[calc(100vh_-_70px)]"
>
	<input type="hidden" bind:value={$formObj.timezone} name="timezone" />

	<div class="grow p-4 overflow-y-auto">
		<div class="mb-4">
			<Label for="clientId">Associated Client</Label>
			<select
				id="clientId"
				name="clientId"
				bind:value={$formObj.clientId}
				on:change={(e) => handleGetLocations(e.currentTarget.value)}
				class="w-full p-2 border rounded"
				tabindex={drawerExpanded ? 0 : -1}
				required
			>
				<option value="">Select Client</option>
				{#each clients as client}
					<option value={client.company.id}>
						{client.user.lastName}, {client.user.firstName} - {client.company.companyName}
					</option>
				{/each}
			</select>
		</div>

		<div class="mb-4">
			<Label for="locationId">Location</Label>
			<select
				id="locationId"
				name="locationId"
				bind:value={$formObj.locationId}
				class="w-full p-2 border rounded"
				tabindex={drawerExpanded ? 0 : -1}
				required
				disabled={!locations.length}
			>
				<option value="">Select Location</option>
				{#each locations as location}
					<option value={location.id}>{location.name}</option>
				{/each}
			</select>
		</div>

		<div class="mb-4">
			<Label for="disciplineId">Discipline</Label>
			<select
				id="disciplineId"
				name="disciplineId"
				bind:value={$formObj.disciplineId}
				class="w-full p-2 border rounded"
				tabindex={drawerExpanded ? 0 : -1}
				required
			>
				<option value="">Select Discipline</option>
				{#each disciplines as discipline}
					<option value={discipline.id}>{discipline.name}</option>
				{/each}
			</select>
		</div>

		<div class="mb-4">
			<Label for="experienceLevelId">Experience Level</Label>
			<select
				id="experienceLevelId"
				name="experienceLevelId"
				bind:value={$formObj.experienceLevelId}
				class="w-full p-2 border rounded"
				tabindex={drawerExpanded ? 0 : -1}
				required
			>
				<option value="">Select Experience</option>
				{#each sortedExperienceLevels as level}
					<option value={level.id}>{level.value}</option>
				{/each}
			</select>
		</div>

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
			class="bg-white hover:bg-red-500 hover:text-white border border-red-500 text-red-500 rounded-md"
		>
			Cancel
		</Button>
		<Button
			tabindex={drawerExpanded ? 0 : -1}
			type="submit"
			disabled={$submitting}
			class="px-4 py-2 border border-green-400 bg-green-400 hover:bg-green-400 text-white rounded-md"
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
