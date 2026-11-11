<script lang="ts">
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import TabsWithCounts from '$dtss/TabsWithCounts.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		BlacklistTable,
		DisciplinesTable,
		DocumentsTable,
		ExperienceLevelsTable,
		SkillCategoriesTable,
		SkillsTable,
		TaxonomyConfirmDialog,
		TaxonomySearchField,
		type DocumentRow
	} from '$features/admin/components/taxonomy';

	// Fixture-only review of the taxonomy screens: ?view=disciplines|levels|categories|skills|documents|blacklists|empty
	const view = $derived(page.url.searchParams.get('view') ?? 'disciplines');
	let sidebar = $state<'expanded' | 'rail'>('expanded');
	let confirmOpen = $state(page.url.searchParams.get('confirm') === '1');
	const noop = () => {};

	const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

	const disciplines = [
		{ id: 'd1', name: 'Dental Hygienist', abbreviation: 'RDH', requiresLicense: true, createdAt: '2025-02-03', updatedAt: '2026-10-21' },
		{ id: 'd2', name: 'Dental Assistant', abbreviation: 'DA', requiresLicense: false, createdAt: '2025-02-03', updatedAt: '2025-08-14' },
		{ id: 'd3', name: 'Expanded Function Dental Assistant', abbreviation: 'EFDA', requiresLicense: true, createdAt: '2025-03-11', updatedAt: '2026-01-09' },
		{ id: 'd4', name: 'Dentist', abbreviation: 'DDS', requiresLicense: true, createdAt: '2025-02-03', updatedAt: '2025-02-03' },
		{ id: 'd5', name: 'Front Office', abbreviation: 'FO', requiresLicense: false, createdAt: '2025-04-22', updatedAt: '2025-04-22' }
	];
	const levels = [
		{ id: 'l1', value: 'Less than 1 year', order: 0, createdAt: '2025-02-03', updatedAt: '2025-02-03' },
		{ id: 'l2', value: '1–3 years', order: 1, createdAt: '2025-02-03', updatedAt: '2025-02-03' },
		{ id: 'l3', value: '3–5 years', order: 2, createdAt: '2025-02-03', updatedAt: '2025-02-03' },
		{ id: 'l4', value: '5+ years', order: 3, createdAt: '2025-02-03', updatedAt: '2025-02-03' }
	];
	const categories = [
		{ id: 'c1', name: 'Clinical', description: 'Chairside procedures and patient care.', archivedAt: null, disciplineIds: ['d1', 'd2', 'd3'], skillCount: 9, requisitionCount: 41 },
		{ id: 'c2', name: 'Imaging', description: null, archivedAt: null, disciplineIds: [], skillCount: 4, requisitionCount: 12 },
		{ id: 'c3', name: 'Practice software', description: 'Scheduling and charting systems.', archivedAt: null, disciplineIds: ['d5'], skillCount: 6, requisitionCount: 18 },
		{ id: 'c4', name: 'Legacy certifications', description: null, archivedAt: '2026-06-01', disciplineIds: [], skillCount: 0, requisitionCount: 0 }
	];
	const disciplineName = new Map(disciplines.map((d) => [d.id, d.abbreviation]));
	const skills = [
		{ id: 's1', name: 'Scaling and root planing', categoryId: 'c1', requiresCertificate: false, archivedAt: null, candidateCount: 128, requisitionCount: 22 },
		{ id: 's2', name: 'CPR / BLS', categoryId: 'c1', requiresCertificate: true, archivedAt: null, candidateCount: 301, requisitionCount: 37 },
		{ id: 's3', name: 'Nitrous oxide monitoring', categoryId: 'c1', requiresCertificate: true, archivedAt: null, candidateCount: 0, requisitionCount: 0 },
		{ id: 's4', name: 'Panoramic X-ray', categoryId: 'c2', requiresCertificate: false, archivedAt: null, candidateCount: 88, requisitionCount: 9 },
		{ id: 's5', name: 'Film X-ray', categoryId: 'c2', requiresCertificate: false, archivedAt: '2026-03-02', candidateCount: 14, requisitionCount: 0 }
	];
	const doc = (o: Partial<DocumentRow>): DocumentRow => ({
		id: crypto.randomUUID(),
		createdAt: '2026-10-02',
		updatedAt: '2026-10-02',
		uploadUrl: '#',
		expiryDate: null,
		type: 'LICENSE',
		filename: 'license.pdf',
		candidateId: 'p1',
		candidateFirstName: 'Maria',
		candidateLastName: 'Lopez',
		disciplineId: 'd1',
		disciplineName: 'Dental Hygienist',
		disciplineAbbreviation: 'RDH',
		requiresLicense: true,
		...o
	});
	const documents: DocumentRow[] = [
		doc({ filename: 'FL-RDH-license-2026.pdf', expiryDate: days(-12) }),
		doc({ filename: 'hygiene-license-scan.jpg', expiryDate: days(21), candidateFirstName: 'Aisha', candidateLastName: 'Khan' }),
		doc({ filename: 'bls-card.png', type: 'CERTIFICATE', expiryDate: days(400), candidateFirstName: 'Tom', candidateLastName: 'Becker' }),
		doc({ filename: 'resume-2026.pdf', type: 'RESUME', disciplineId: null, disciplineAbbreviation: null, candidateFirstName: 'Priya', candidateLastName: 'Shah' }),
		doc({ filename: 'DA-registration.pdf', disciplineAbbreviation: 'DA', requiresLicense: false, expiryDate: days(-40), candidateFirstName: 'Leo', candidateLastName: 'Grant' }),
		doc({ filename: 'independent-contractor-agreement-signed-final-v2.pdf', type: 'AGREEMENT', disciplineId: null, disciplineAbbreviation: null })
	];
	const blacklist = [
		{ candidateId: 'p1', companyId: 'co1', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@example.com', avatarUrl: null, companyName: 'Bright Smiles Tampa', createdAt: '2026-09-14' },
		{ candidateId: 'p2', companyId: 'co2', firstName: 'Tom', lastName: 'Becker', email: 'tbecker@example.com', avatarUrl: null, companyName: 'Harbor Dental Group', createdAt: '2026-07-02' },
		{ candidateId: 'p3', companyId: 'co3', firstName: null, lastName: null, email: 'no-name@example.com', avatarUrl: null, companyName: null, createdAt: '2026-05-30' }
	];
</script>

{#snippet docTabs()}
	<div class="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
		<TabsWithCounts
			label="Document type"
			active="ALL"
			tabs={[
				{ value: 'ALL', label: 'All', href: '#', count: 6 },
				{ value: 'RESUME', label: 'Resume', href: '#', count: 1 },
				{ value: 'LICENSE', label: 'License', href: '#', count: 3 },
				{ value: 'CERTIFICATE', label: 'Certificate', href: '#', count: 1 },
				{ value: 'AGREEMENT', label: 'Agreement', href: '#', count: 1 },
				{ value: 'OTHER', label: 'Other', href: '#', count: 0 }
			]}
		/>
		<TabsWithCounts
			label="Credential state"
			active="ALL"
			tabs={[
				{ value: 'ALL', label: 'All credentials', href: '#' },
				{ value: 'EXPIRED', label: 'Expired', href: '#', count: 1, tone: 'negative' },
				{ value: 'EXPIRING', label: 'Expiring soon', href: '#', count: 1, tone: 'warning' }
			]}
		/>
	</div>
{/snippet}
{#snippet search()}<TaxonomySearchField label="Search by filename or professional" />{/snippet}
{#snippet orderBar()}
	<div class="flex flex-wrap items-center gap-3">
		<Button size="sm">Save order</Button>
		<Button variant="outline" size="sm">Discard changes</Button>
		<span class="text-sm text-muted-foreground">Unsaved order changes</span>
	</div>
{/snippet}

<AdminShell pathname="/admin/menu" nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC">
	{#if view === 'disciplines'}
		<Page>
			<PageHeader title="Disciplines" description="The roles professionals hold and practices request, and whether each needs a license.">
				{#snippet actions()}<Button>Add discipline</Button>{/snippet}
			</PageHeader>
			<TaxonomySearchField label="Search disciplines" />
			<DisciplinesTable rows={disciplines} sort={{ column: 'name', direction: 'asc' }} sortHref={() => '#'} onAdd={noop} onEdit={noop} onDelete={() => (confirmOpen = true)} />
		</Page>
	{:else if view === 'levels'}
		<Page>
			<PageHeader title="Experience levels" description="The options professionals choose from, in the order they're shown.">
				{#snippet actions()}<Button>Add experience level</Button>{/snippet}
			</PageHeader>
			<ExperienceLevelsTable rows={levels} toolbar={orderBar} onMove={noop} onAdd={noop} onDelete={noop} />
		</Page>
	{:else if view === 'categories'}
		<Page>
			<PageHeader title="Skill categories" description="Group skills and choose which disciplines each category applies to.">
				{#snippet actions()}<Button variant="outline">Manage skills</Button><Button>Add category</Button>{/snippet}
			</PageHeader>
			<SkillCategoriesTable rows={categories} {disciplineName} onAdd={noop} onEdit={noop} onArchive={noop} onDelete={noop} />
		</Page>
	{:else if view === 'skills'}
		<Page>
			<PageHeader title="Skills" description="Skills professionals can hold and requests can require.">
				{#snippet actions()}<Button variant="outline">Manage categories</Button><Button>Add skill</Button>{/snippet}
			</PageHeader>
			{#each categories.slice(0, 2) as category (category.id)}
				<SkillsTable {category} rows={skills.filter((s) => s.categoryId === category.id)} onAdd={noop} onEdit={noop} onArchive={noop} onDelete={noop} />
			{/each}
		</Page>
	{:else if view === 'documents'}
		<Page width="full">
			<PageHeader title="Documents" description="Every file professionals have uploaded, with credential expiry for the disciplines that require one." />
			<DocumentsTable rows={documents} sort={{ column: 'createdAt', direction: 'desc' }} sortHref={() => '#'} pagination={{ page: 1, pageSize: 10, total: 6, href: () => '#' }} tabs={docTabs} toolbar={search} onDelete={noop} />
		</Page>
	{:else if view === 'blacklists'}
		<Page>
			<PageHeader title="Blacklists" description="Every professional a practice has blocked, across all practices." />
			<BlacklistTable rows={blacklist} pagination={{ page: 1, pageSize: 25, total: 3, href: () => '#' }} toolbar={search} onRemove={noop} />
		</Page>
	{:else}
		<Page>
			<PageHeader title="Empty states" />
			<DisciplinesTable rows={[]} onAdd={noop} onEdit={noop} onDelete={noop} />
			<DocumentsTable rows={[]} filtered onDelete={noop} />
			<BlacklistTable rows={[]} search="Tampa" onRemove={noop} />
		</Page>
	{/if}
</AdminShell>

<TaxonomyConfirmDialog
	bind:open={confirmOpen}
	title="Delete Dental Assistant?"
	description="The discipline is removed from the list professionals and practices choose from. This can't be undone."
	action="#"
	fields={{ id: 'd2' }}
	confirmLabel="Delete discipline"
	confirmText="DELETE"
/>
