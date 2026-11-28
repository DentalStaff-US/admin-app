<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { AdminRequisitionSchema } from '$lib/config/zod-schemas';
	import { superForm } from 'sveltekit-superforms/client';
	import { updateFlash } from 'sveltekit-flash-message';
	import { page } from '$app/stores';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { onMount, onDestroy } from 'svelte';
	import { Check, ChevronsUpDown } from 'lucide-svelte';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';
	import SkillRequirementsPicker from '$lib/components/requisitions/SkillRequirementsPicker.svelte';
	import Notice from '$dtss/Notice.svelte';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';

	export let form: SuperValidated<AdminRequisitionSchema>;
	export let drawerExpanded: boolean;
	export let currentCompanyID: string | null = null;
	/** Unsaved changes, for the sheet's "Discard changes?" prompt. */
	export let dirty = false;

	let openClient = false;
	let openLocation = false;
	let openDiscipline = false;

	let clients: any[] = [];
	let locations: any[] = [];
	let disciplines: any[] = [];
	let experienceLevels: any[] = [];
	let selectedLocation: any = null;
	let selectedCompany: {
		value: string;
		label: string;
		sublabel: string;
	} | null = null;
	let selectedDiscipline: any = null;

	$: sortedExperienceLevels = [...experienceLevels].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0)
	);

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
			clients = clientsRes.sort((a: any, b: any) =>
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
		if ($tainted && Object.keys($tainted).length > 0) {
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

	$: dirty = !!$tainted && Object.keys($tainted).length > 0;

	// shadcn Selects (bits-ui 0.x) take a {value,label} pair; hidden inputs post
	// the same values the native selects did.
	$: experienceSelected = (() => {
		const l = experienceLevels.find((x) => x.id === $formObj.experienceLevelId);
		return l ? { value: l.id, label: l.value } : { value: '', label: 'No preference' };
	})();
	$: typeSelected =
		String($formObj.permanentPosition) === 'true'
			? { value: 'true', label: 'Permanent' }
			: { value: 'false', label: 'Temporary' };
</script>

<form use:enhance method="POST" action="/requisitions?/admin" class="space-y-5">
	<input type="hidden" bind:value={$formObj.timezone} name="timezone" />
	<input type="hidden" bind:value={$formObj.clientId} name="clientId" />
	<input type="hidden" bind:value={$formObj.locationId} name="locationId" />
	<input type="hidden" bind:value={$formObj.disciplineId} name="disciplineId" />
	<input type="hidden" name="experienceLevelId" value={$formObj.experienceLevelId ?? ''} />
	<input type="hidden" name="permanentPosition" value={String($formObj.permanentPosition ?? false)} />


	{#if $message}
		<!-- Server-side rejection (e.g. billing not set up), next to the form that failed. -->
		<Notice tone="negative" alert>{$message}</Notice>
	{/if}
	<!-- Associated Client Combobox -->
	<div class="space-y-1.5">
		<Label for="clientId" class="text-sm font-semibold">Practice <span class="text-destructive">*</span></Label>
		<Popover.Root bind:open={openClient} let:ids>
			<Popover.Trigger asChild let:builder>
				<Button
					builders={[builder]}
					variant="outline"
					role="combobox"
					aria-expanded={openClient}
					class={cn('w-full justify-between font-normal', $errors.clientId && 'border-destructive')}
				>
					{selectedCompany?.label ?? 'Select a practice'}
					<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</Popover.Trigger>
			<Popover.Content class="p-0 max-h-[300px] overflow-auto" align="start" sameWidth>
				<Command.Root>
					<Command.Input placeholder="Search practices…" />
					<Command.Empty>No practice found.</Command.Empty>
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
		{#if $errors.clientId}<p class="text-sm text-destructive">{$errors.clientId}</p>{/if}
	</div>

	<!-- Location Combobox -->
	<div class="space-y-1.5">
		<Label for="locationId" class="text-sm font-semibold">Location <span class="text-destructive">*</span></Label>
		<Popover.Root bind:open={openLocation} let:ids>
			<Popover.Trigger asChild let:builder>
				<Button
					builders={[builder]}
					variant="outline"
					role="combobox"
					aria-expanded={openLocation}
					class={cn('w-full justify-between font-normal', $errors.locationId && 'border-destructive')}
					disabled={!locations.length}
				>
					{selectedLocation?.name ?? 'Select a location'}
					<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</Popover.Trigger>
			<Popover.Content class="p-0  max-h-[300px] overflow-auto" align="start" sameWidth>
				<Command.Root>
					<Command.Input placeholder="Search locations…" />
					<Command.Empty>No location found.</Command.Empty>
					<Command.Group>
						{#each locations as location}
							<Command.Item
								value={location.name}
								onSelect={() => {
									$formObj.locationId = location.id;
									selectedLocation = location;
									$formObj.timezone = location.timezone;
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
		{#if $errors.locationId}<p class="text-sm text-destructive">{$errors.locationId}</p>{/if}
	</div>

	<!-- Discipline Combobox -->
	<div class="space-y-1.5">
		<Label for="disciplineId" class="text-sm font-semibold">Discipline <span class="text-destructive">*</span></Label>
		<Popover.Root bind:open={openDiscipline} let:ids>
			<Popover.Trigger asChild let:builder>
				<Button
					builders={[builder]}
					variant="outline"
					role="combobox"
					aria-expanded={openDiscipline}
					class={cn('w-full justify-between font-normal', $errors.disciplineId && 'border-destructive')}
				>
					{selectedDiscipline?.name ?? 'Select a discipline'}
					<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</Popover.Trigger>
			<Popover.Content class="p-0 max-h-[300px] overflow-auto" align="start" sameWidth>
				<Command.Root>
					<Command.Input placeholder="Search disciplines…" />
					<Command.Empty>No discipline found.</Command.Empty>
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
	<div class="space-y-1.5">
		<SkillRequirementsPicker disciplineId={$formObj.disciplineId} />
	</div>

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
			{#if $submitting}
				<Loader2 class="animate-spin" aria-hidden="true" />
				Creating…
			{:else}
				Create requisition
			{/if}
		</Button>
	</div>
</form>
