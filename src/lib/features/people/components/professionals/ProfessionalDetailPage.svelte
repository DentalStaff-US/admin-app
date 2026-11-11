<script lang="ts">
	import { page } from '$app/state';
	import { AlertCircle, Pencil } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import Page from '$dtss/Page.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import StatusBadge from '$dtss/StatusBadge.svelte';
	import ImpersonateButton from '$lib/components/admin/ImpersonateButton.svelte';
	import DetailHeader from '../DetailHeader.svelte';
	import DetailTabs from '../DetailTabs.svelte';
	import HistoryTimeline from '../HistoryTimeline.svelte';
	import { CandidatePermanentTab } from '$features/requisitions';
	import ProfileNotes from '../ProfileNotes.svelte';
	import StatusMenu from '../StatusMenu.svelte';
	import ToneBadge from '../ToneBadge.svelte';
	import DisciplinesSheet from './DisciplinesSheet.svelte';
	import ProfessionalAvailability from './ProfessionalAvailability.svelte';
	import ProfessionalDocuments from './ProfessionalDocuments.svelte';
	import ProfessionalEditSheet from './ProfessionalEditSheet.svelte';
	import ProfessionalOverview from './ProfessionalOverview.svelte';
	import ProfessionalShifts from './ProfessionalShifts.svelte';
	import ProfessionalTimesheets from './ProfessionalTimesheets.svelte';
	import { credentialProblems, disciplineCredentials } from '../../credentials';
	import { displayName, initialsOf, profileStatusLabel, readTab, timesheetsFromShifts } from '../../people';

	/**
	 * The professional detail body (06 › Professionals / clients detail):
	 * PageHeader with avatar, status and key badges; tabs as child components;
	 * edits in FormSheets. Admin-only tabs and actions follow the same
	 * SUPERADMIN check as before; the actions re-check on the server.
	 */
	let { data }: { data: any } = $props();

	const candidate = $derived(data.candidate);
	const isAdmin = $derived(data.user?.role === 'SUPERADMIN');
	const name = $derived(candidate ? displayName(candidate.user.firstName, candidate.user.lastName, candidate.user.email) : '');
	const disciplines = $derived((data.allDisciplines ?? []) as any[]);
	const certSkills = $derived((data.candidateSkills ?? []).filter((s: any) => s.requiresCertificate));
	const shifts = $derived(data.workHistory ?? []);
	const timesheets = $derived(timesheetsFromShifts(shifts));
	const problems = $derived(credentialProblems(disciplines.flatMap((d) => disciplineCredentials(d))));

	const tabs = $derived([
		{ value: 'overview', label: 'Overview' },
		...(isAdmin ? [{ value: 'availability', label: 'Availability' }] : []),
		...(isAdmin ? [{ value: 'shifts', label: 'Shifts', count: shifts.length }] : []),
		...(isAdmin ? [{ value: 'timesheets', label: 'Timesheets', count: timesheets.length }] : []),
		{ value: 'documents', label: 'Documents', count: (data.documents ?? []).length },
		...(isAdmin ? [{ value: 'permanent', label: 'Permanent' }] : []),
		...(isAdmin ? [{ value: 'notes', label: 'Notes', count: (data.comments ?? []).length }] : []),
		...(isAdmin ? [{ value: 'history', label: 'History' }] : [])
	]);
	let tab = $state('overview');
	$effect(() => {
		tab = readTab(page.url.searchParams.get('tab'), tabs.map((t) => t.value));
	});

	let editOpen = $state(false);
	let disciplinesOpen = $state(false);
</script>

{#if candidate}
	<Page>
		<DetailHeader
			title={name}
			subtitle={isAdmin && candidate.profile.puid ? `Professional #${candidate.profile.puid}` : 'Professional'}
			avatar={{ src: candidate.user.avatarUrl, initials: initialsOf(candidate.user.firstName, candidate.user.lastName), audience: 'pro' }}
			back={{ href: '/professionals', label: 'Professionals' }}
		>
			{#snippet meta()}
				<StatusBadge
					status={candidate.profile.status ?? 'PENDING'}
					label={candidate.profile.status === 'PENDING' || !candidate.profile.status ? 'Pending review' : profileStatusLabel(candidate.profile.status)}
				/>
				{#each disciplines as d (d.discipline.id)}
					<span class="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{d.discipline.abbreviation || d.discipline.name}</span>
				{/each}
				{#each problems as p, i (i)}<ToneBadge tone={p.tone} label={p.label} />{/each}
			{/snippet}
			{#snippet actions()}
				{#if isAdmin}
					<!-- Candidates can't hold a session here, so this opens the candidate portal in a new tab. -->
					<ImpersonateButton
						userId={candidate.user.id}
						userName={name}
						crossApp
						size="default"
					/>
					<Button variant="outline" class="gap-2" on:click={() => (editOpen = true)}><Pencil class="size-4" aria-hidden="true" />Edit</Button>
					<StatusMenu kind="professional" {name} status={candidate.profile.status} />
				{/if}
			{/snippet}
		</DetailHeader>

		<DetailTabs {tabs} bind:value={tab} label="Professional sections">
			{#snippet children(active)}
				{#if active === 'overview'}
					<ProfessionalOverview
						{candidate}
						{disciplines}
						{isAdmin}
						skillCatalog={data.skillCatalog}
						candidateSkills={data.candidateSkills}
						onEditDetails={() => (editOpen = true)}
						onEditDisciplines={() => (disciplinesOpen = true)}
					/>
				{:else if active === 'availability'}
					<ProfessionalAvailability availability={data.availability} window={data.availabilityWindow} firstName={candidate.user.firstName ?? 'This professional'} />
				{:else if active === 'shifts'}
					<ProfessionalShifts {shifts} />
				{:else if active === 'timesheets'}
					<ProfessionalTimesheets {timesheets} />
				{:else if active === 'documents'}
					<ProfessionalDocuments documents={data.documents ?? []} {disciplines} {certSkills} documentsForm={data.documentsForm} {isAdmin} />
				{:else if active === 'permanent'}
					<CandidatePermanentTab items={data.permanentActivity ?? []} firstName={candidate.user.firstName} />
				{:else if active === 'notes'}
					<Section title="Notes" description="Visible to DTSS admins only.">
						<ProfileNotes comments={data.comments ?? []} currentUserId={data.user.id} addAction="?/addComment" deleteAction="?/deleteComment" />
					</Section>
				{:else if active === 'history'}
					<Section title="History" description="Changes to this professional's record, newest first.">
						<HistoryTimeline entries={data.activity ?? []} />
					</Section>
				{/if}
			{/snippet}
		</DetailTabs>
	</Page>

	{#if isAdmin}
		<ProfessionalEditSheet bind:open={editOpen} form={data.personalDetailsForm} {candidate} />
		<DisciplinesSheet
			bind:open={disciplinesOpen}
			form={data.disciplinesForm}
			disciplines={data.availableDisciplines ?? []}
			levels={data.experienceLevels ?? []}
		/>
	{/if}
{:else}
	<Page width="narrow">
		<EmptyState icon={AlertCircle} title="Professional not found" description="This professional couldn't be found. They may have been removed.">
			<Button href="/professionals">Back to professionals</Button>
		</EmptyState>
	</Page>
{/if}
