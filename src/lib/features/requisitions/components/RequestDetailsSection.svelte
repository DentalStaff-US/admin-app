<script lang="ts">
	import { enhance } from '$app/forms';
	import { Pencil } from 'lucide-svelte';
	import FormSheet from '$dtss/FormSheet.svelte';
	import Section from '$dtss/Section.svelte';
	import SkillRequirementsPicker from '$lib/components/requisitions/SkillRequirementsPicker.svelte';
	import SkillRequirementsSummary from '$lib/components/requisitions/SkillRequirementsSummary.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';

	type Requirement = {
		categoryId: string;
		categoryName: string;
		matchMode: 'ALL' | 'ANY';
		skills: { id: string; name: string; requiresCertificate: boolean }[];
	};

	let {
		requisition,
		skillRequirements = [],
		disciplines = [],
		experienceLevels = [],
		canEdit = false
	}: {
		requisition: {
			jobDescription: string | null;
			specialInstructions: string | null;
			purchaseOrderNumber: string | null;
			disciplineId: string;
			experienceLevelId: string | null;
			hourlyRate: number | null;
		};
		skillRequirements?: Requirement[];
		disciplines?: { id: string; name: string }[];
		experienceLevels?: { id: string; value: string; order?: number | null }[];
		canEdit?: boolean;
	} = $props();

	let editOpen = $state(false);
	let saving = $state(false);

	// Edit state, reseeded from the saved request each time the sheet opens.
	let disciplineId = $state('');
	let experienceLevelId = $state('');
	let hourlyRate = $state<number | string>('');
	let purchaseOrderNumber = $state('');
	let jobDescription = $state('');
	let specialInstructions = $state('');
	let pickerTouched = $state(false);

	function seed() {
		disciplineId = requisition.disciplineId;
		experienceLevelId = requisition.experienceLevelId ?? '';
		hourlyRate = requisition.hourlyRate ?? '';
		purchaseOrderNumber = requisition.purchaseOrderNumber ?? '';
		jobDescription = requisition.jobDescription ?? '';
		specialInstructions = requisition.specialInstructions ?? '';
		pickerTouched = false;
	}
	function openEdit() {
		seed();
		editOpen = true;
	}

	const dirty = $derived(
		editOpen &&
			(disciplineId !== requisition.disciplineId ||
				experienceLevelId !== (requisition.experienceLevelId ?? '') ||
				String(hourlyRate) !== String(requisition.hourlyRate ?? '') ||
				purchaseOrderNumber !== (requisition.purchaseOrderNumber ?? '') ||
				jobDescription !== (requisition.jobDescription ?? '') ||
				specialInstructions !== (requisition.specialInstructions ?? '') ||
				pickerTouched)
	);

	const sortedLevels = $derived([...experienceLevels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
	const disciplineName = $derived(disciplines.find((d) => d.id === disciplineId)?.name ?? '');
	const levelName = $derived(
		experienceLevelId ? (experienceLevels.find((l) => l.id === experienceLevelId)?.value ?? '') : 'No preference'
	);
</script>

<Section title="Details" description="Job description and requirements.">
	{#snippet actions()}
		{#if canEdit}
			<Button variant="outline" size="sm" class="gap-1" on:click={openEdit}>
				<Pencil class="size-3.5" aria-hidden="true" /> Edit
			</Button>
		{/if}
	{/snippet}

	<dl class="divide-y">
		<div class="pb-5">
			<dt class="text-overline uppercase text-muted-foreground">Job description</dt>
			<dd class="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{requisition.jobDescription || '—'}</dd>
		</div>
		{#if requisition.specialInstructions}
			<div class="py-5">
				<dt class="text-overline uppercase text-muted-foreground">Special instructions</dt>
				<dd class="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed">{requisition.specialInstructions}</dd>
			</div>
		{/if}
		<div class="py-5">
			<dt class="text-overline uppercase text-muted-foreground">Skill requirements</dt>
			<dd class="mt-2"><SkillRequirementsSummary requirements={skillRequirements} /></dd>
		</div>
		<div class="pt-5">
			<dt class="text-overline uppercase text-muted-foreground">Purchase order #</dt>
			<dd class="mt-2 text-sm">{requisition.purchaseOrderNumber || '—'}</dd>
		</div>
	</dl>
</Section>

{#if canEdit}
	<FormSheet bind:open={editOpen} {dirty} title="Edit request" description="Changes are saved to the request and the assigned professionals are notified.">
		<form
			id="edit-request-form"
			method="POST"
			action="?/updateRequisition"
			class="space-y-5"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success' || result.type === 'redirect') editOpen = false;
					await update();
				};
			}}
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="edit-discipline" class="font-semibold">Discipline</Label>
					<Select.Root
						selected={{ value: disciplineId, label: disciplineName }}
						onSelectedChange={(v) => v && (disciplineId = String(v.value))}
					>
						<Select.Trigger id="edit-discipline"><Select.Value placeholder="Choose a discipline" /></Select.Trigger>
						<Select.Content class="max-h-72 overflow-y-auto">
							{#each disciplines as d (d.id)}
								<Select.Item value={d.id} label={d.name}>{d.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="disciplineId" value={disciplineId} />
				</div>
				<div class="space-y-1.5">
					<Label for="edit-experience" class="font-semibold">Experience level</Label>
					<Select.Root
						selected={{ value: experienceLevelId, label: levelName }}
						onSelectedChange={(v) => v && (experienceLevelId = String(v.value))}
					>
						<Select.Trigger id="edit-experience"><Select.Value /></Select.Trigger>
						<Select.Content class="max-h-72 overflow-y-auto">
							<Select.Item value="" label="No preference">No preference</Select.Item>
							{#each sortedLevels as l (l.id)}
								<Select.Item value={l.id} label={l.value}>{l.value}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					<input type="hidden" name="experienceLevelId" value={experienceLevelId} />
				</div>
				<div class="space-y-1.5">
					<Label for="edit-rate" class="font-semibold">Hourly rate</Label>
					<div class="relative">
						<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">$</span>
						<Input id="edit-rate" name="hourlyRate" type="number" min="0" class="pl-6 tabular-nums" bind:value={hourlyRate} />
					</div>
				</div>
				<div class="space-y-1.5">
					<Label for="edit-po" class="font-semibold">Purchase order #</Label>
					<Input id="edit-po" name="purchaseOrderNumber" type="text" bind:value={purchaseOrderNumber} />
				</div>
			</div>
			<div class="space-y-1.5">
				<Label for="edit-jd" class="font-semibold">Job description</Label>
				<Textarea id="edit-jd" name="jobDescription" class="min-h-28" bind:value={jobDescription} />
			</div>
			<!-- The picker is legacy; a change anywhere in it counts as an edit. -->
			<div class="rounded-lg bg-muted/50 p-4" onchange={() => (pickerTouched = true)} onclick={() => (pickerTouched = true)} role="presentation">
				{#key editOpen}
					<SkillRequirementsPicker disciplineId={disciplineId} initial={skillRequirements} />
				{/key}
			</div>
			<div class="space-y-1.5">
				<Label for="edit-si" class="font-semibold">Special instructions</Label>
				<Textarea id="edit-si" name="specialInstructions" bind:value={specialInstructions} />
			</div>
		</form>

		{#snippet footer()}
			<Button type="button" variant="outline" on:click={() => (editOpen = false)}>Cancel</Button>
			<Button type="submit" form="edit-request-form" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
		{/snippet}
	</FormSheet>
{/if}
