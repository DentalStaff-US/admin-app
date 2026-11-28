<script lang="ts">
	/**
	 * Fixture previews for the timesheet and invoice screens (dev only; gated by
	 * _dev/+layout.server.ts). Query params:
	 *   view=list|detail|invoices|invoice   role=admin|practice
	 *   status=PENDING|DRAFT|DISCREPANCY|APPROVED|VOID   wages=WAGES_DUE|WAGES_PAID
	 *   method=PAPER|STRIPE (practice flag)   invoiceType=PAPER|STRIPE   invoiceStatus=open|paid|void
	 *   unfinished=1   empty=1   (list tab/filters/sort/search work as on the real page)
	 */
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import {
		TimesheetAdmin,
		TimesheetReview,
		TimesheetsListPage,
		readTimesheetListQuery,
		shapeTimesheetList,
		toPracticeLedger,
		toTimesheetListRow,
		type TimesheetPageData
	} from '$features/timesheets';
	import { InvoiceDetail, InvoicesListPage, readInvoiceListQuery, shapeInvoiceList, toInvoiceListRow } from '$features/invoices';

	const url = $derived(page.url);
	const q = (k: string, d = '') => url.searchParams.get(k) ?? d;
	const view = $derived(q('view', 'list'));
	const admin = $derived(q('role', 'admin') === 'admin');
	let sidebar = $state<'expanded' | 'rail'>('expanded');

	// ---- Timesheet list -------------------------------------------------------
	const people = [
		['Maria', 'Lopez'], ['James', 'Okafor'], ['Priya', 'Shah'], ['Tom', 'Becker'], ['Ana', 'Ruiz'],
		['Lena', 'Moore'], ['Sam', 'Patel'], ['Grace', 'Kim'], ['Noah', 'Diaz'], ['Ivy', 'Chen']
	];
	const practices = ['Bright Smiles Dental', 'Oak Street Family Dentistry', 'Harbor Dental Group'];
	const roles = ['Dental Hygienist', 'Dental Assistant', 'Front Office'];
	const statuses: [string, string | null][] = [
		['PENDING', null], ['PENDING', null], ['DISCREPANCY', null], ['APPROVED', 'WAGES_DUE'], ['APPROVED', 'WAGES_PAID'],
		['PENDING', null], ['DRAFT', null], ['VOID', null], ['APPROVED', 'WAGES_DUE'], ['PENDING', null], ['DISCREPANCY', null], ['APPROVED', 'WAGES_PAID']
	];
	const rawSheets = Array.from({ length: 26 }, (_, i) => {
		const [status, wagesStatus] = statuses[i % statuses.length];
		const [firstName, lastName] = people[i % people.length];
		return {
			timesheet: {
				id: `ts_${1000 + i}`,
				status,
				wagesStatus,
				totalHoursWorked: String(8 * ((i % 5) + 1) - (i % 3) * 0.75),
				weekBeginDate: `2026-${i < 13 ? '11-02' : '10-26'}`
			},
			requisition: { id: 1040 + (i % 7), disciplineName: roles[i % roles.length] },
			clientCompany: { companyName: practices[i % practices.length] },
			candidate: { firstName, lastName }
		};
	});
	const timesheetList = $derived.by(() => {
		const query = readTimesheetListQuery(url);
		const term = q('search').toLowerCase();
		const rows = (q('empty') ? [] : rawSheets)
			.map(toTimesheetListRow)
			.filter((r) => !admin ? r.practice === practices[0] : true)
			.map((r) => (admin ? r : { ...r, practice: null }))
			.filter((r) => !term || `${r.professional} ${r.practice ?? ''} ${r.discipline}`.toLowerCase().includes(term));
		return { list: shapeTimesheetList(rows, query, 8), query };
	});

	// ---- Timesheet detail -----------------------------------------------------
	const z = (date: string, hhmm: string) => `${date}T${hhmm}:00Z`; // EST = UTC−5
	const dates = ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
	const recurrenceDays = dates.map((date, i) => ({
		id: `rd${i}`,
		date,
		dayStart: z(date, '13:00'),
		dayEnd: z(date, '21:30'),
		lunchStart: z(date, '17:00'),
		lunchEnd: z(date, '17:30')
	}));
	const hoursRaw = [
		{ date: '2026-11-03', workdayId: 'wd0', hours: 8, startTime: z('2026-11-03', '13:00'), endTime: z('2026-11-03', '21:30'), lunchStartTime: z('2026-11-03', '17:00'), lunchEndTime: z('2026-11-03', '17:30') },
		{ date: '2026-11-04', workdayId: 'wd1', hours: 7.58, startTime: z('2026-11-04', '13:25'), endTime: z('2026-11-04', '21:30'), lunchStartTime: z('2026-11-04', '17:00'), lunchEndTime: z('2026-11-04', '17:30') },
		{ date: '2026-11-05', workdayId: 'wd2', hours: 8, startTime: z('2026-11-05', '13:00'), endTime: z('2026-11-05', '21:30'), lunchStartTime: z('2026-11-05', '17:00'), lunchEndTime: z('2026-11-05', '17:30') },
		{ date: '2026-11-06', workdayId: 'wd3', hours: 9.5, startTime: z('2026-11-06', '13:00'), endTime: z('2026-11-06', '23:00'), lunchStartTime: z('2026-11-06', '17:00'), lunchEndTime: z('2026-11-06', '17:30') },
		{ date: '2026-11-07', hours: 4, startTime: z('2026-11-07', '14:00'), endTime: z('2026-11-07', '18:00') }
	];
	const audit = (id: string, daysAgo: number, action: string, actorName: string, actorRole: string, extra = {}) => ({
		id,
		createdAt: new Date(Date.parse('2026-11-09T15:00:00Z') - daysAgo * 864e5),
		action,
		entityType: 'TIMESHEETS',
		entityId: 'ts_1',
		userId: 'u',
		actorName,
		actorEmail: null,
		actorRole,
		impersonatedBy: null,
		impersonatorName: null,
		source: 'WEB',
		ipAddress: null,
		userAgent: null,
		requestPath: null,
		metadata: null,
		changes: null,
		...extra
	});

	const timesheetData = $derived.by((): TimesheetPageData => {
		const status = q('status', 'PENDING');
		const method = q('method', 'STRIPE') as 'PAPER' | 'STRIPE';
		const approved = status === 'APPROVED';
		return {
			user: { role: admin ? 'SUPERADMIN' : 'CLIENT' },
			timesheet: {
				timeSheetId: 'ts_1',
				createdAt: '2026-11-02T05:00:00Z',
				updatedAt: '2026-11-08T22:10:00Z',
				totalHoursWorked: '37.08',
				weekBeginDate: '2026-11-02',
				requisitionId: 1042,
				clientCompanyName: 'Bright Smiles Dental',
				hourlyRate: 48,
				hoursRaw,
				status,
				discrepancyNote: status === 'DISCREPANCY' ? 'Wednesday she arrived at 8:25, not 8:00. Saturday was not a scheduled shift.' : null,
				adjustedHourlyRate: q('adjusted') ? 52 : null,
				wagesStatus: approved ? q('wages', 'WAGES_DUE') : null,
				candidate: { firstName: 'Maria', lastName: 'Lopez', puid: 'P-20931', workersCompCode: '8832', email: 'maria.lopez@example.com' }
			},
			requisition: { id: 1042, discipline: { name: 'Dental Hygienist' }, referenceTimezone: 'America/New_York', location: { timezone: 'America/New_York' } },
			workdays: recurrenceDays.map((rd, i) => ({ workday: { id: `wd${i}` }, recurrenceDay: rd })),
			recurrenceDays,
			invoice: approved ? { id: 'inv_1', invoiceType: method } : null,
			expenses: [
				{ id: 'e1', description: 'Parking, Nov 3–6', amountCents: 2400, status: approved ? 'APPROVED' : 'PENDING', rejectionReason: null, createdAt: '2026-11-06T22:00:00Z' },
				{ id: 'e2', description: 'Replacement loupes light', amountCents: 8950, status: 'REJECTED', rejectionReason: 'Equipment is provided by the practice.', createdAt: '2026-11-05T22:00:00Z', updatedAt: '2026-11-07T14:00:00Z' }
			],
			adminFeeSettings: {
				amount: q('fee') ? 30 : 35,
				type: 'PERCENTAGE',
				source: q('fee') ? 'OVERRIDE' : 'PLATFORM',
				label: q('fee') ? 'Admin Fee (30%, agreed)' : 'Admin Fee (35%)',
				overrideAmount: q('fee') ? '30' : null,
				overrideType: q('fee') ? 'PERCENTAGE' : null,
				platformAmount: 35,
				platformType: 'PERCENTAGE',
				frozen: approved
			},
			addExpenseForm: { id: 'addExpense', valid: false, posted: false, errors: {}, data: { description: '', amountDollars: undefined }, constraints: {} },
			hasUnfinishedWorkdays: !!q('unfinished'),
			unfinishedWorkdayCount: q('unfinished') ? 1 : 0,
			priorWeekHours: 8,
			auditHistory: [
				audit('a1', 0, 'VIEW', 'Shannon Carter', 'SUPERADMIN'),
				audit('c2', 0.1, 'COMMENT', 'Shannon Carter', 'SUPERADMIN', { metadata: { comment: 'Maria agrees she arrived at 8:25. Saturday was cover the practice asked for by phone.', visibility: 'INTERNAL' } }),
				audit('c1', 0.5, 'REJECT', 'Dana Whitfield', 'CLIENT', { metadata: { discrepancyNote: 'Wednesday she arrived at 8:25, not 8:00.' } }),
				audit('a2', 1, 'SUBMIT', 'Maria Lopez', 'CANDIDATE'),
				audit('a3', 2, 'CREATE', 'Maria Lopez', 'CANDIDATE', { metadata: { kind: 'TIMESHEET_EXPENSE' } }),
				audit('a4', 3, 'VIEW', 'Dana Whitfield', 'CLIENT'),
				audit('a5', 6, 'CREATE', null as unknown as string, '', { userId: null })
			],
			practiceLedger: toPracticeLedger([
				audit('p3', 0.2, 'RESUBMIT', 'Shannon Carter', 'SUPERADMIN', { metadata: { comment: 'We corrected Wednesday’s start to 8:25.' } }),
				audit('p2', 0.5, 'REJECT', 'Dana Whitfield', 'CLIENT', { metadata: { discrepancyNote: 'Wednesday she arrived at 8:25, not 8:00.' } }),
				audit('p1', 1, 'SUBMIT', 'Maria Lopez', 'CANDIDATE')
			]),
			invoiceMethod: method
		};
	});

	// ---- Invoices -----------------------------------------------------------
	const invStatuses = ['open', 'open', 'paid', 'void', 'open', 'paid', 'draft'];
	const rawInvoices = Array.from({ length: 23 }, (_, i) => ({
		invoice: {
			id: `inv_${i}`,
			invoiceNumber: `DTSS-2026-${String(410 + i).padStart(4, '0')}`,
			status: invStatuses[i % invStatuses.length],
			invoiceType: i % 4 === 0 ? 'PAPER' : 'STRIPE',
			total: (1200 + i * 87.5).toFixed(2),
			createdAt: new Date(Date.parse('2026-11-08') - i * 3 * 864e5).toISOString(),
			dueDate: new Date(Date.parse('2026-11-22') - i * 3 * 864e5).toISOString()
		},
		company: { companyName: practices[i % practices.length] },
		candidate: { user: { firstName: people[i % people.length][0], lastName: people[i % people.length][1] } },
		requisition: { id: 1040 + (i % 7) }
	}));
	const invoiceList = $derived.by(() => {
		const query = readInvoiceListQuery(url);
		const term = q('search').toLowerCase();
		const rows = (q('empty') ? [] : rawInvoices)
			.map((r) => toInvoiceListRow(r, new Date('2026-11-10T12:00:00')))
			.filter((r) => (admin ? true : r.practice === practices[0]))
			.filter((r) => !term || `${r.number} ${r.practice} ${r.professional}`.toLowerCase().includes(term));
		return { list: shapeInvoiceList(rows, query, 8), query };
	});

	const invoiceData = $derived.by(() => {
		const status = q('invoiceStatus', 'open');
		const type = q('invoiceType', q('method', 'STRIPE'));
		const paper = type === 'PAPER';
		const paid = status === 'paid' ? 2137.06 : paper ? 500 : 0;
		return {
			user: { role: admin ? 'SUPERADMIN' : 'CLIENT' },
			invoice: {
				invoice: {
					id: 'inv_1',
					invoiceNumber: 'DTSS-2026-0418',
					status,
					invoiceType: type,
					total: '2137.06',
					taxAmount: 0,
					amountPaid: String(paid),
					amountRemaining: String(2137.06 - paid),
					createdAt: '2026-11-08T22:15:00Z',
					updatedAt: '2026-11-09T10:02:00Z',
					dueDate: q('overdue') ? '2026-11-01T00:00:00Z' : '2026-11-22T00:00:00Z',
					paidAt: status === 'paid' ? '2026-11-09T10:02:00Z' : null,
					voidedAt: status === 'void' ? '2026-11-09T10:02:00Z' : null,
					voidReason: status === 'void' ? 'Hours corrected after the practice reported Wednesday’s late start.' : null,
					sourceType: 'timesheet',
					timesheetId: 'ts_1',
					stripeInvoiceId: paper ? null : 'in_1QxYzAbCdEf',
					stripePdfUrl: paper ? null : '#',
					stripeHostedUrl: paper ? null : '#',
					description: 'Dental Hygienist, week of Nov 2 – Nov 8, 2026 (Maria Lopez)',
					attempted: !!q('failed'),
					attemptCount: q('failed') ? 2 : 0
				},
				lineItems: [
					{ description: 'Regular hours, Dental Hygienist', quantity: 32, unit_amount: 4800, amount: 153600 },
					{ description: 'Overtime hours (1.5×)', quantity: 5.08, unit_amount: 7200, amount: 36576 },
					{ description: 'Parking, Nov 3–6', quantity: 1, unit_amount: 2400, amount: 2400 },
					{ description: 'Administration fee (35% of regular)', quantity: 1, unit_amount: 21130, amount: 21130 }
				],
				client: { id: 'cl_1', clientInvoiceMethod: q('method', 'STRIPE') },
				clientUser: { firstName: 'Dana', lastName: 'Whitfield' },
				company: { companyName: 'Bright Smiles Dental', billingEmail: q('billing') === 'none' ? null : 'accounts@brightsmiles.example' },
				candidate: { user: { firstName: 'Maria', lastName: 'Lopez' } },
				requisition: { id: 1042 },
				timesheet: { id: 'ts_1' }
			},
			paperTransactions: paper
				? [{ id: 't1', batchNumber: 'CHK-1042', transactionType: 'PAYMENT', status: 'SUCCESSFUL', amount: '500.00', details: { notes: 'Partial payment, rest promised Friday.' }, createdAt: '2026-11-09T15:00:00Z' }]
				: [],
			stripePayments: !paper && status === 'paid' ? [{ id: 'p1', amount: 2137.06, status: 'paid', paidAt: '2026-11-09T10:02:00Z', reference: 'pi_3QxY…' }] : [],
			activity: [
				{ ...audit('i1', 0, 'VIEW', 'Dana Whitfield', 'CLIENT'), entityType: 'INVOICES' },
				{ ...audit('i2', 1, 'EMAIL_SENT', null as unknown as string, ''), entityType: 'INVOICES' },
				{ ...audit('i3', 1, 'CREATE', null as unknown as string, ''), entityType: 'INVOICES' }
			]
		};
	});
</script>

<AdminShell
	pathname={view.startsWith('invoice') ? '/invoices' : '/timesheets'}
	nav={{ role: admin ? 'SUPERADMIN' : 'CLIENT' }}
	bind:sidebar
	name={admin ? 'Shannon Carter' : 'Dana Whitfield'}
	initials={admin ? 'SC' : 'DW'}
>
	{#if view === 'list'}
		<TimesheetsListPage list={timesheetList.list} query={timesheetList.query} search={q('search')} isAdmin={admin} {url} />
	{:else if view === 'detail'}
		{#key url.search}
			{#if admin}<TimesheetAdmin data={timesheetData} />{:else}<TimesheetReview data={timesheetData} />{/if}
		{/key}
	{:else if view === 'invoices'}
		<InvoicesListPage list={invoiceList.list} query={invoiceList.query} search={q('search')} isAdmin={admin} {url} />
	{:else}
		{#key url.search}
			<InvoiceDetail data={invoiceData as any} isAdmin={admin} />
		{/key}
	{/if}
</AdminShell>
