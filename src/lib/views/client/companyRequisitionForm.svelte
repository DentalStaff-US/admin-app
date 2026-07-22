<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { ClientRequisitionSchema } from '$lib/config/zod-schemas';
	import { onMount, onDestroy } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import type { ClientCompanyLocationSelect } from '$lib/server/database/schemas/client';

	export let form: SuperValidated<ClientRequisitionSchema>;
	export let drawerExpanded: boolean;
	export let location: ClientCompanyLocationSelect | null | undefined = null;

	const {
		form: formObj,
		errors,
		enhance,
		submitting,
		reset,
		tainted
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

	let locations: any[] = [];
	let disciplines: any[] = [];
	let experienceLevels: any[] = [];

	const handleGetLocations = async () => {
		const req = await fetch(`/api/locations/getCompanyLocations`, {
			method: 'GET'
		});
		const locationsRes = await req.json();
		locations = locationsRes;

		// Auto-select if only one location
		if (locations.length === 1) {
			$formObj.locationId = locations[0].id;
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
		await handleGetLocations();
		await handleFetchExperienceLevels();
		await handleFetchDisciplines();

		window.addEventListener('beforeunload', handleBeforeUnload);
	});

	onDestroy(() => {
		window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	function handleReset() {
		reset();
	}

	function handleDrawerClose() {
		handleReset();
		drawerExpanded = false;
	}

	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if ($tainted && Object.keys($tainted).length > 0) {
			event.preventDefault();
			event.returnValue = '';
		}
	}

	$: if (!drawerExpanded) {
		handleReset();
	}
	$: if (location) {
		$formObj.locationId = location.id;
		$formObj.timezone = location.timezone;
	}
	$: if ($formObj.locationId) {
		const selectedLocation = locations.find((location) => location.id === $formObj.locationId);
		if (selectedLocation) {
			$formObj.timezone = selectedLocation.timezone;
		}
	}

	$: sortedExperienceLevels = [...experienceLevels].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0)
	);
</script>

<form
	use:enhance
	method="POST"
	action="/requisitions?/client"
	class="grow flex flex-col h-full max-h-[calc(100vh_-_70px)]"
>
	<input type="hidden" bind:value={$formObj.timezone} name="timezone" />
	<div class="grow p-4 overflow-y-auto">
		<div class="mb-4">
			<Label for="locationId">Location <span class="text-red-600">*</span></Label>
			<select
				id="locationId"
				name="locationId"
				bind:value={$formObj.locationId}
				class="w-full p-2 border rounded {$errors.locationId ? 'border-red-500' : ''}"
				on:change={(e) => {
					const selected = locations.find((l) => l.id === e.currentTarget.value);
					if (selected) $formObj.timezone = selected.timezone;
				}}
			>
				<option value="">Select Location</option>
				{#each locations as location}
					<option value={location.id}>{location.name}</option>
				{/each}
			</select>
			{#if $errors.locationId}<p class="text-xs text-red-600 mt-1">{$errors.locationId}</p>{/if}
		</div>

		<div class="mb-4">
			<Label for="disciplineId">Discipline <span class="text-red-600">*</span></Label>
			<select
				id="disciplineId"
				name="disciplineId"
				bind:value={$formObj.disciplineId}
				class="w-full p-2 border rounded {$errors.disciplineId ? 'border-red-500' : ''}"
			>
				<option value="">Select Discipline</option>
				{#each disciplines as discipline}
					<option value={discipline.id}>{discipline.name}</option>
				{/each}
			</select>
			{#if $errors.disciplineId}<p class="text-xs text-red-600 mt-1">{$errors.disciplineId}</p>{/if}
		</div>

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

		<div class="mb-4">
			<Label for="permanentPosition">Requisition Type</Label>
			<select
				id="permanentPosition"
				name="permanentPosition"
				bind:value={$formObj.permanentPosition}
				class="w-full p-2 border rounded"
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
				class="w-full p-2 border rounded {$errors.jobDescription ? 'border-red-500' : ''}"
				rows="4"
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
			{$submitting ? 'Submitting...' : 'Create Requisition'}
		</Button>
	</div>
</form>
