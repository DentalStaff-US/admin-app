<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { ClientRequisitionSchema } from '$lib/config/zod-schemas';
	import { onMount, onDestroy } from 'svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { updateFlash } from 'sveltekit-flash-message';
	import { page } from '$app/stores';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import SkillRequirementsPicker from '$lib/components/requisitions/SkillRequirementsPicker.svelte';
	import Notice from '$dtss/Notice.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import type { ClientCompanyLocationSelect } from '$lib/server/database/schemas/client';

	export let form: SuperValidated<ClientRequisitionSchema>;
	export let drawerExpanded: boolean;
	export let location: ClientCompanyLocationSelect | null | undefined = null;
	/** Unsaved changes, for the sheet's "Discard changes?" prompt. */
	export let dirty = false;

	const {
		form: formObj,
		errors,
		enhance,
		message,
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
		resetForm: true,
		// superforms only invalidates on success, so a flash set alongside a
		// failure (e.g. the billing gate) would otherwise sit in the cookie until
		// the next page load. Read it now so the toast fires immediately.
		onUpdated: async ({ form }) => {
			if (!form.valid) await updateFlash(page);
		}
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

	$: dirty = !!$tainted && Object.keys($tainted).length > 0;

	// shadcn Selects (bits-ui 0.x) take a {value,label} pair; hidden inputs post
	// the same values the native selects did.
	$: locationSelected = (() => {
		const l = locations.find((x) => x.id === $formObj.locationId);
		return l ? { value: l.id, label: l.name } : undefined;
	})();
	$: disciplineSelected = (() => {
		const d = disciplines.find((x) => x.id === $formObj.disciplineId);
		return d ? { value: d.id, label: d.name } : undefined;
	})();
	$: experienceSelected = (() => {
		const l = experienceLevels.find((x) => x.id === $formObj.experienceLevelId);
		return l ? { value: l.id, label: l.value } : { value: '', label: 'No preference' };
	})();
	$: typeSelected =
		String($formObj.permanentPosition) === 'true'
			? { value: 'true', label: 'Permanent' }
			: { value: 'false', label: 'Temporary' };

	$: sortedExperienceLevels = [...experienceLevels].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0)
	);
</script>

<form use:enhance method="POST" action="/requisitions?/client" class="space-y-5">
	<input type="hidden" bind:value={$formObj.timezone} name="timezone" />
	<input type="hidden" name="locationId" value={$formObj.locationId ?? ''} />
	<input type="hidden" name="disciplineId" value={$formObj.disciplineId ?? ''} />
	<input type="hidden" name="experienceLevelId" value={$formObj.experienceLevelId ?? ''} />
	<input type="hidden" name="permanentPosition" value={String($formObj.permanentPosition ?? false)} />

	{#if $message}
		<!-- Server-side rejection (e.g. billing not set up), next to the form that failed. -->
		<Notice tone="negative" alert>{$message}</Notice>
	{/if}

	<div class="space-y-1.5">
		<Label for="locationId" class="text-sm font-semibold">Location <span class="text-destructive">*</span></Label>
		<Select.Root
			selected={locationSelected}
			onSelectedChange={(v) => {
				if (!v) return;
				$formObj.locationId = String(v.value);
				const selected = locations.find((l) => l.id === v.value);
				if (selected) $formObj.timezone = selected.timezone;
			}}
		>
			<Select.Trigger id="locationId" aria-invalid={$errors.locationId ? 'true' : undefined} class={cn($errors.locationId && 'border-destructive')}>
				<Select.Value placeholder="Select a location" />
			</Select.Trigger>
			<Select.Content class="max-h-72 overflow-y-auto">
				{#each locations as loc (loc.id)}
					<Select.Item value={loc.id} label={loc.name}>{loc.name}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		{#if $errors.locationId}<p class="text-sm text-destructive">{$errors.locationId}</p>{/if}
	</div>

	<div class="space-y-1.5">
		<Label for="disciplineId" class="text-sm font-semibold">Discipline <span class="text-destructive">*</span></Label>
		<Select.Root selected={disciplineSelected} onSelectedChange={(v) => v && ($formObj.disciplineId = String(v.value))}>
			<Select.Trigger id="disciplineId" aria-invalid={$errors.disciplineId ? 'true' : undefined} class={cn($errors.disciplineId && 'border-destructive')}>
				<Select.Value placeholder="Select a discipline" />
			</Select.Trigger>
			<Select.Content class="max-h-72 overflow-y-auto">
				{#each disciplines as discipline (discipline.id)}
					<Select.Item value={discipline.id} label={discipline.name}>{discipline.name}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		{#if $errors.disciplineId}<p class="text-sm text-destructive">{$errors.disciplineId}</p>{/if}
	</div>

	<div class="grid gap-5 sm:grid-cols-2">
		<div class="space-y-1.5">
			<Label for="permanentPosition" class="text-sm font-semibold">Type</Label>
			<Select.Root selected={typeSelected} onSelectedChange={(v) => v && ($formObj.permanentPosition = v.value === 'true')}>
				<Select.Trigger id="permanentPosition"><Select.Value /></Select.Trigger>
				<Select.Content>
					<Select.Item value="false" label="Temporary">Temporary</Select.Item>
					<Select.Item value="true" label="Permanent">Permanent</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
		<div class="space-y-1.5">
			<Label for="experienceLevelId" class="text-sm font-semibold">Experience</Label>
			<Select.Root selected={experienceSelected} onSelectedChange={(v) => v && ($formObj.experienceLevelId = String(v.value))}>
				<Select.Trigger id="experienceLevelId"><Select.Value /></Select.Trigger>
				<Select.Content class="max-h-72 overflow-y-auto">
					<Select.Item value="" label="No preference">No preference</Select.Item>
					{#each sortedExperienceLevels as level (level.id)}
						<Select.Item value={level.id} label={level.value}>{level.value}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<!-- Skill requirements: per category, No Preference / all / any -->
	<SkillRequirementsPicker disciplineId={$formObj.disciplineId} />

	<div class="grid gap-5 sm:grid-cols-2">
		<div class="space-y-1.5">
			<Label for="hourlyRate" class="text-sm font-semibold">Hourly rate <span class="text-destructive">*</span></Label>
			<div class="relative">
				<span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden="true">$</span>
				<Input
					type="number"
					id="hourlyRate"
					name="hourlyRate"
					inputmode="decimal"
					bind:value={$formObj.hourlyRate}
					aria-invalid={$errors.hourlyRate ? 'true' : undefined}
					class={cn('pl-7 tabular-nums', $errors.hourlyRate && 'border-destructive')}
				/>
			</div>
			{#if $errors.hourlyRate}<p class="text-sm text-destructive">{$errors.hourlyRate}</p>{/if}
		</div>
		<div class="space-y-1.5">
			<Label for="purchaseOrderNumber" class="text-sm font-semibold">Purchase order # <span class="font-normal text-muted-foreground">(optional)</span></Label>
			<Input type="text" id="purchaseOrderNumber" name="purchaseOrderNumber" bind:value={$formObj.purchaseOrderNumber} />
		</div>
	</div>

	<div class="space-y-1.5">
		<Label for="jobDescription" class="text-sm font-semibold">Job description <span class="text-destructive">*</span></Label>
		<Textarea
			id="jobDescription"
			name="jobDescription"
			bind:value={$formObj.jobDescription}
			rows={4}
			aria-invalid={$errors.jobDescription ? 'true' : undefined}
			class={cn($errors.jobDescription && 'border-destructive')}
		/>
		{#if $errors.jobDescription}<p class="text-sm text-destructive">{$errors.jobDescription}</p>{/if}
	</div>

	<div class="space-y-1.5">
		<Label for="specialInstructions" class="text-sm font-semibold">Special instructions <span class="font-normal text-muted-foreground">(optional)</span></Label>
		<Textarea id="specialInstructions" name="specialInstructions" bind:value={$formObj.specialInstructions} rows={4} />
	</div>

	<!-- Sheet footer: pinned to the bottom of the scrolling sheet body. -->
	<div class="sticky -bottom-5 -mx-6 -mb-5 flex flex-col-reverse gap-3 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
		<Button type="button" variant="outline" on:click={handleDrawerClose}>Cancel</Button>
		<Button type="submit" disabled={$submitting}>
			{$submitting ? 'Posting…' : 'Post request'}
		</Button>
	</div>
</form>
