<!--
  Dev-only fixtures for the requisitions screens. Nothing here reads data.
  ?view=list|detail|pipeline|candidate · ?role=admin|practice · ?type=temp|permanent
  list: &tab=open|filled|past|permanent|all · pipeline: &board=1 · detail: &status=OPEN|PAYMENT_REQUIRED|… &tab=…
  Other previews: ./workday, ./sheets, ./tabs
-->
<script lang="ts">
	import { page } from '$app/stores';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		CandidatePermanentTab,
		PermanentPipelinePage,
		RequestDetailPage,
		RequestsTable,
		buildList,
		countStages,
		facets as buildFacets,
		feeState,
		mergeCandidateActivity,
		parseTab,
		readFilters,
		type ListRow
	} from '$features/requisitions';
	import type { PipelineRow } from '$features/requisitions/server/permanent';

	const q = $derived($page.url.searchParams);
	const view = $derived(q.get('view') ?? 'list');
	const admin = $derived(q.get('role') !== 'practice');
	const permanent = $derived(q.get('type') === 'permanent');
	const now = new Date('2026-11-10T15:00:00Z');

	const iso = (d: string, h: number) => `${d}T${String(h).padStart(2, '0')}:00:00Z`;
	const day = (id: string, date: string, status: string, pro?: [string, string]) => ({
		id,
		date,
		dayStart: iso(date, 12),
		dayEnd: iso(date, 21),
		lunchStart: iso(date, 16),
		lunchEnd: iso(date, 17),
		status,
		workdayCancelledAt: null,
		professional: pro ? { candidateId: `c-${id}`, firstName: pro[0], lastName: pro[1], avatarUrl: null } : null
	});

	// ── List fixtures
	const listRows: ListRow[] = [
		{ id: 1042, title: 'Dental Hygienist', status: 'OPEN', createdAt: '2026-11-01T12:00:00Z', hourlyRate: 48, permanentPosition: false, referenceTimezone: 'America/New_York', locationId: 'l1', locationName: 'Tampa – Westshore', companyId: 'co1', companyName: 'Bright Smiles Dental', disciplineName: 'Dental Hygienist', days: [day('a', '2026-11-12', 'FILLED'), day('b', '2026-11-13', 'FILLED'), day('c', '2026-11-14', 'FILLED'), day('d', '2026-11-17', 'OPEN'), day('e', '2026-11-18', 'OPEN')] },
		{ id: 1041, title: null, status: 'OPEN', createdAt: '2026-11-02T12:00:00Z', hourlyRate: 30, permanentPosition: false, referenceTimezone: 'America/New_York', locationId: 'l2', locationName: 'Brandon', companyId: 'co2', companyName: 'Oak Street Family Dentistry', disciplineName: 'Dental Assistant', days: [day('f', '2026-11-11', 'OPEN')] },
		{ id: 1040, title: 'Hygienist – Saturdays', status: 'OPEN', createdAt: '2026-10-28T12:00:00Z', hourlyRate: 52, permanentPosition: false, referenceTimezone: 'America/New_York', locationId: 'l1', locationName: 'Tampa – Westshore', companyId: 'co1', companyName: 'Bright Smiles Dental', disciplineName: 'Dental Hygienist', days: [day('g', '2026-11-14', 'FILLED'), day('h', '2026-11-21', 'FILLED')] },
		{ id: 1039, title: 'Associate Hygienist', status: 'OPEN', createdAt: '2026-11-03T12:00:00Z', hourlyRate: 45, permanentPosition: true, referenceTimezone: 'America/New_York', locationId: 'l3', locationName: 'St. Petersburg', companyId: 'co3', companyName: 'Harbor Dental Group', disciplineName: 'Dental Hygienist', days: [], applicantCount: 4 },
		{ id: 1037, title: 'Office Manager', status: 'PAYMENT_REQUIRED', createdAt: '2026-10-20T12:00:00Z', hourlyRate: 32, permanentPosition: true, referenceTimezone: 'America/New_York', locationId: 'l1', locationName: 'Tampa – Westshore', companyId: 'co1', companyName: 'Bright Smiles Dental', disciplineName: 'Front Office', unbilled: true, days: [], applicantCount: 1 },
		{ id: 1031, title: 'Dental Assistant', status: 'CLOSED', createdAt: '2026-10-01T12:00:00Z', hourlyRate: 28, permanentPosition: false, referenceTimezone: 'America/New_York', locationId: 'l2', locationName: 'Brandon', companyId: 'co2', companyName: 'Oak Street Family Dentistry', disciplineName: 'Dental Assistant', days: [day('i', '2026-10-06', 'FILLED'), day('j', '2026-10-07', 'CANCELED')] }
	];
	const listTab = $derived(parseTab(q.get('tab')));
	const list = $derived(
		buildList(listRows, { tab: listTab, filters: readFilters($page.url), sort: { column: 'created', direction: 'desc' }, page: 1, pageSize: 20, now })
	);

	// ── Detail fixtures
	const status = $derived(q.get('status') ?? (permanent ? 'OPEN' : 'OPEN'));
	const applications = [
		{ application: { id: 'a1', status: 'PENDING', source: 'ADMIN_RECOMMENDED', createdAt: '2026-11-06T14:00:00Z', recommendationNote: 'Six years in perio, available from December, great with anxious patients.' }, user: { firstName: 'Maria', lastName: 'Lopez', avatarUrl: null }, candidateProfile: { id: 'c1' }, experienceLevel: { value: '5+ years' } },
		{ application: { id: 'a2', status: 'PENDING', source: 'CANDIDATE', createdAt: '2026-11-05T14:00:00Z' }, user: { firstName: 'Priya', lastName: 'Shah', avatarUrl: null }, candidateProfile: { id: 'c2' }, experienceLevel: { value: '3+ years' } },
		{ application: { id: 'a3', status: 'PENDING', source: 'CANDIDATE', createdAt: '2026-11-04T14:00:00Z' }, user: { firstName: 'Dana', lastName: 'Ortiz', avatarUrl: null }, candidateProfile: { id: 'c3' }, experienceLevel: null },
		{ application: { id: 'a4', status: 'DENIED', source: 'CANDIDATE', createdAt: '2026-11-02T14:00:00Z' }, user: { firstName: 'Lee', lastName: 'Chen', avatarUrl: null }, candidateProfile: { id: 'c4' }, experienceLevel: null }
	];
	const interested = [
		{ candidateId: 'c7', userId: 'u7', firstName: 'Ava', lastName: 'Brooks', avatarUrl: null, savedAt: '2026-11-08T10:00:00Z' },
		{ candidateId: 'c8', userId: 'u8', firstName: 'Noah', lastName: 'Patel', avatarUrl: null, savedAt: '2026-11-07T10:00:00Z' }
	];
	const counts = $derived(
		countStages(
			applications.map((a) => ({ candidateId: a.candidateProfile.id, status: status === 'PAYMENT_REQUIRED' && a.application.id === 'a1' ? 'APPROVED' : a.application.status, source: a.application.source })),
			['c7', 'c8', 'c2']
		)
	);
	const sv = (data: Record<string, unknown>) => ({ id: 'f', valid: false, posted: false, data, errors: {}, constraints: {} });
	const detailData = $derived({
		user: { id: 'u-admin', role: admin ? 'SUPERADMIN' : 'CLIENT' },
		hasRequisitionRights: true,
		requisition: {
			id: permanent ? 1039 : 1042,
			title: permanent ? 'Associate Hygienist' : 'Dental Hygienist',
			status,
			createdAt: '2026-11-03T12:00:00Z',
			permanentPosition: permanent,
			hourlyRate: permanent ? 45 : 48,
			referenceTimezone: 'America/New_York',
			purchaseOrderNumber: 'PO-7781',
			jobDescription: 'Full hygiene column for a busy family practice. Adult prophys, perio maintenance and SRP; Dentrix charting.',
			specialInstructions: 'Park in the back lot. Ask for Maria at the front desk.',
			disciplineId: 'd1',
			experienceLevelId: 'e2',
			discipline: { name: 'Dental Hygienist' },
			experienceLevel: { value: '3+ years' },
			location: { id: 'l1', name: 'Tampa – Westshore' },
			company: { clientId: 'cl1' }
		},
		company: { companyName: 'Bright Smiles Dental' },
		location: { id: 'l1', name: 'Tampa – Westshore', timezone: 'America/New_York', operatingHours: {} },
		recurrenceDays: [
			day('r1', '2026-11-12', 'FILLED', ['Maria', 'Lopez']),
			day('r2', '2026-11-13', 'FILLED', ['Maria', 'Lopez']),
			day('r3', '2026-11-14', 'OPEN'),
			day('r4', '2026-11-17', 'UNFULFILLED'),
			{ ...day('r5', '2026-11-18', 'CANCELED', ['Priya', 'Shah']), workdayCancelledAt: '2026-11-09T12:00:00Z' }
		],
		timesheets: [
			{ timeSheet: { id: 't1', weekBeginDate: '2026-11-09', totalHoursWorked: '16.0', totalHoursBilled: '16.0', status: 'PENDING' }, user: { firstName: 'Maria', lastName: 'Lopez' } }
		],
		applications: permanent ? applications.map((a) => (status === 'PAYMENT_REQUIRED' && a.application.id === 'a1' ? { ...a, application: { ...a.application, status: 'APPROVED' } } : a)) : [],
		lifecycle: permanent
			? { counts, fee: feeState(status, status === 'PAYMENT_REQUIRED'), interested: admin ? interested : [] }
			: null,
		comments: permanent
			? [
					{ id: 'm1', body: 'We would love someone who can start before the holidays.', internal: false, createdAt: '2026-11-04T15:00:00Z', authorId: 'u-client', authorFirstName: 'Ana', authorLastName: 'Reyes', authorRole: 'CLIENT' },
					...(admin ? [{ id: 'm2', body: 'Maria is the strongest fit; confirming her start date.', internal: true, createdAt: '2026-11-05T15:00:00Z', authorId: 'u-admin', authorFirstName: 'Shannon', authorLastName: 'Carter', authorRole: 'SUPERADMIN' }] : [])
				]
			: [],
		billing: { invoices: [], payments: [], summary: { totalBilled: 0, totalPaid: 0, outstanding: 0, unbilled: status === 'PAYMENT_REQUIRED' } },
		potentialMatches: [],
		activity: [],
		disciplines: [{ id: 'd1', name: 'Dental Hygienist' }],
		experienceLevels: [{ id: 'e2', value: '3+ years', order: 2 }],
		skillRequirements: [],
		qualifiedProfessionals: [],
		recurrenceDayForm: sv({ recurrenceDays: '' }),
		invoiceForm: sv({ amount: 0, dueDate: '', description: '', invoiceMethod: 'PAPER', items: '[]' }),
		clientInvoiceMethod: 'STRIPE',
		billingBlockedMessage: null,
		billingMismatchMessage: null
	});

	// ── Pipeline fixtures
	const pRow = (id: number, title: string, company: string, st: string, c: Partial<PipelineRow['counts']>, unbilled = false): PipelineRow => ({
		id,
		title,
		status: st,
		createdAt: new Date('2026-11-01'),
		companyId: company,
		companyName: company,
		locationId: 'l1',
		locationName: 'Tampa – Westshore',
		disciplineName: 'Dental Hygienist',
		fee: feeState(st, unbilled),
		counts: { interested: 0, applied: 0, recommended: 0, hired: 0, denied: 0, ...c }
	});
	const pipelineRows = [
		pRow(1039, 'Associate Hygienist', 'Harbor Dental Group', 'OPEN', { interested: 3, applied: 2, recommended: 1, denied: 1 }),
		pRow(1044, 'Lead Assistant', 'Bright Smiles Dental', 'OPEN', { interested: 5 }),
		pRow(1046, 'Front Desk Coordinator', 'Oak Street Family Dentistry', 'PENDING', {}),
		pRow(1037, 'Office Manager', 'Bright Smiles Dental', 'PAYMENT_REQUIRED', { hired: 1, denied: 2 }, true),
		pRow(1033, 'Hygienist', 'Harbor Dental Group', 'PAYMENT_REQUIRED', { hired: 1 }, false)
	];
	const pipelineFacets = $derived(buildFacets(listRows));

	// ── Candidate tab fixtures
	const req = (requisitionId: number, title: string, requestStatus = 'OPEN') => ({ requisitionId, title, requestStatus, disciplineName: 'Dental Hygienist', companyName: 'Harbor Dental Group', locationName: 'St. Petersburg' });
	const candidateItems = mergeCandidateActivity(
		[
			{ ...req(1039, 'Associate Hygienist'), applicationId: 'a1', status: 'PENDING', source: 'ADMIN_RECOMMENDED', createdAt: '2026-11-06T14:00:00Z' },
			{ ...req(1020, 'Hygienist', 'PAYMENT_RECEIVED'), applicationId: 'a9', status: 'DENIED', source: 'CANDIDATE', createdAt: '2026-09-02T14:00:00Z' }
		],
		[
			{ ...req(1044, 'Lead Hygienist'), savedAt: '2026-11-08T10:00:00Z' },
			{ ...req(1039, 'Associate Hygienist'), savedAt: '2026-11-01T10:00:00Z' }
		]
	);

	let sidebar = $state<'expanded' | 'rail'>('expanded');
	const pathname = $derived(view === 'list' || view === 'detail' ? '/requisitions' : view === 'pipeline' ? '/requisitions/permanent' : '/professionals');
</script>

<AdminShell {pathname} nav={{ role: admin ? 'SUPERADMIN' : 'CLIENT' }} bind:sidebar name={admin ? 'Shannon Carter' : 'Ana Reyes'} initials={admin ? 'SC' : 'AR'}>
	{#if view === 'list'}
		<Page>
			<PageHeader title={admin ? 'Requisitions' : 'Requests'} description={admin ? 'Every temp and permanent request across practices.' : 'Temp shifts and permanent positions across your locations.'}>
				{#snippet actions()}
					{#if admin}<Button variant="outline" href="?view=pipeline">Permanent pipeline</Button>{/if}
					<Button>New {admin ? 'requisition' : 'request'}</Button>
				{/snippet}
			</PageHeader>
			<RequestsTable
				url={$page.url}
				rows={list.rows}
				total={list.total}
				page={list.page}
				pageSize={20}
				tab={listTab}
				counts={list.counts}
				sort={{ column: 'created', direction: 'desc' }}
				facets={buildFacets(listRows)}
				isAdmin={admin}
				noun={admin ? 'requisition' : 'request'}
			/>
		</Page>
	{:else if view === 'detail'}
		<RequestDetailPage data={detailData} />
	{:else if view === 'pipeline'}
		<PermanentPipelinePage
			url={$page.url}
			tab="active"
			view={q.get('board') === '1' ? 'board' : 'table'}
			rows={pipelineRows}
			tabCounts={{ active: 5, done: 12 }}
			facets={{ location: pipelineFacets.location, discipline: pipelineFacets.discipline, practice: pipelineFacets.practice }}
		/>
	{:else}
		<Page>
			<PageHeader title="Maria Lopez" description="Dental Hygienist · Tampa, FL" />
			<CandidatePermanentTab items={candidateItems} firstName="Maria" />
		</Page>
	{/if}
</AdminShell>
