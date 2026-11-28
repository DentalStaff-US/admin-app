<script lang="ts">
	import { format } from 'date-fns';
	import { Pencil } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import Section from '$dtss/Section.svelte';
	import FactGrid, { type Fact } from '$dtss/FactGrid.svelte';
	import ToneBadge from '../ToneBadge.svelte';
	import CandidateSkillsEditor from '$lib/components/skills/CandidateSkillsEditor.svelte';
	import { formatUSPhoneForDisplay } from '$lib/_helpers/phone';
	import CertificationDialog from './CertificationDialog.svelte';
	import { disciplineCredentials } from '../../credentials';
	import { workPreferenceLabel } from '../../people';

	/** Overview tab: contact facts, experience & rates with credentials, skills. */
	let {
		candidate,
		disciplines,
		isAdmin,
		skillCatalog,
		candidateSkills,
		onEditDetails,
		onEditDisciplines
	}: {
		candidate: any;
		disciplines: any[];
		isAdmin: boolean;
		skillCatalog: any;
		candidateSkills: any;
		onEditDetails?: () => void;
		onEditDisciplines?: () => void;
	} = $props();

	let certFor = $state<any | null>(null);
	let certOpen = $state(false);

	const birthday = $derived.by(() => {
		const raw = candidate.profile.birthday;
		// A calendar date: read 'YYYY-MM-DD' at local noon so it can't slip a day.
		const date = raw ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw) : null;
		return date && !Number.isNaN(date.getTime()) ? format(date, 'P') : null;
	});

	const facts: Fact[] = $derived([
		{ label: 'Email', cell: emailCell },
		{ label: 'Cell', cell: phoneCell },
		...(isAdmin ? [{ label: 'Address', cell: addressCell }] : []),
		{ label: 'Date of birth', value: birthday },
		...(isAdmin ? [{ label: "Workers' comp", value: candidate.profile.workersCompCode || 'None' }] : []),
		{ label: 'Looking for', cell: preferenceCell }
	]);

	// The certification "Add" is hidden on disciplines that already need a
	// license (the license is the gate), but "Edit" survives so a mistaken
	// declaration can still be removed — only staff can remove one.
	const canEditCert = (d: any) => !d.discipline?.requiresLicense || d.experience?.requiresCert;
</script>

{#snippet addressCell()}
	<span class="block whitespace-normal break-words">{candidate.profile.completeAddress || 'None on file'}</span>
{/snippet}

{#snippet emailCell()}
	<span class="flex flex-wrap items-center gap-2 whitespace-normal">
		<a href="mailto:{candidate.user.email}" class="break-all text-primary-dark hover:underline">{candidate.user.email}</a>
		{#if !candidate.user.receiveEmail}<ToneBadge tone="negative" label="Email opted out" hint="Opted out of manual email campaigns. Platform emails and reminders still send." />{/if}
	</span>
{/snippet}

{#snippet phoneCell()}
	<span class="flex flex-wrap items-center gap-2 whitespace-normal">
		{#if candidate.profile.cellPhone}
			<a href="tel:{candidate.profile.cellPhone}" class="text-primary-dark hover:underline">{formatUSPhoneForDisplay(candidate.profile.cellPhone)}</a>
		{:else}—{/if}
		{#if !candidate.user.receiveSms}<ToneBadge tone="negative" label="SMS opted out" hint="Replied STOP to campaign texts. Platform texts and reminders still send." />{/if}
	</span>
{/snippet}

{#snippet preferenceCell()}
	<span class="block whitespace-normal">
		{workPreferenceLabel(candidate.profile.workPreference)}
		{#if !candidate.profile.workPreference}<span class="font-normal text-muted-foreground">(default)</span>{/if}
	</span>
{/snippet}

<div class="space-y-6">
	<Section title="Contact & details">
		{#snippet actions()}
			{#if isAdmin && onEditDetails}
				<Button variant="outline" size="sm" class="gap-2" aria-label="Edit contact and details" on:click={onEditDetails}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
			{/if}
		{/snippet}
		<FactGrid {facts} columns={3} />
	</Section>

	<Section title="Experience & rates" description="Credentials are judged per discipline. Expiry dates live on the linked documents." flush>
		{#snippet actions()}
			{#if isAdmin && onEditDisciplines}
				<Button variant="outline" size="sm" class="gap-2" aria-label="Edit experience and rates" on:click={onEditDisciplines}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
			{/if}
		{/snippet}
		{#if disciplines.length === 0}
			<p class="px-5 py-6 text-sm text-muted-foreground sm:px-6">No disciplines yet.</p>
		{:else}
			<ul class="divide-y">
				{#each disciplines as d (d.discipline.id)}
					{@const chips = disciplineCredentials(d)}
					<li class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
						<div class="min-w-0 space-y-2">
							<div>
								<p class="font-semibold">{d.discipline.name}</p>
								<p class="text-sm text-muted-foreground">{d.experience?.experienceLevel ?? '—'}</p>
							</div>
							{#if chips.length}
								<div class="flex flex-wrap gap-1.5">
									{#each chips as c (c.track)}<ToneBadge tone={c.tone} label={c.label} />{/each}
								</div>
							{/if}
							{#if isAdmin && canEditCert(d)}
								<Button variant="link" size="sm" class="h-auto p-0" on:click={() => { certFor = d; certOpen = true; }}>
									{d.experience?.requiresCert ? 'Edit certification' : 'Add certification'}
								</Button>
							{/if}
						</div>
						<p class="shrink-0 font-bold tabular-nums">${d.salaryRange?.min || 0}–${d.salaryRange?.max || 0}/hr</p>
					</li>
				{/each}
			</ul>
		{/if}
	</Section>

	<Section title="Skills">
		<CandidateSkillsEditor catalog={skillCatalog} held={candidateSkills} editable={isAdmin} />
	</Section>
</div>

{#if certFor}
	<CertificationDialog
		bind:open={certOpen}
		disciplineId={certFor.discipline.id}
		disciplineName={certFor.discipline.name}
		requiresCert={Boolean(certFor.experience?.requiresCert)}
		hasCertDocument={Boolean(certFor.effectiveCertExpiry)}
	/>
{/if}
