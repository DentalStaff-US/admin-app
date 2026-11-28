// Fake data for the dashboard design review. Built with the real rules, so the
// rows read exactly as production would. Never imported outside /_dev.
import {
	complianceItem,
	discrepancyItem,
	dueInvoiceItem,
	overdueInvoiceItem,
	pendingClientItem,
	pendingProfessionalItem,
	pendingTimesheetItem,
	permApplicantsItem,
	signatureItem,
	staffNoLocationItem,
	supportItem,
	unbilledPlacementItem,
	unfilledSoonItem
} from '$lib/features/dashboard/server/attentionRules';
import { complianceSection } from '$lib/features/dashboard/compliance';
import { capabilitiesFor } from '$lib/features/dashboard/scope';
import {
	failed,
	ok,
	type AdminKpis,
	type AttentionGroup,
	type AttentionItem,
	type AttentionKind,
	type CoverageShift,
	type DashboardScope
} from '$lib/features/dashboard/types';
import { nextBusinessDays } from '$lib/features/dashboard/window';
import { agreementStatus } from '$lib/features/dashboard/agreements';
import { weeksAround, type AdminTrends } from '$lib/features/dashboard/trends';

export const NOW = new Date('2026-11-10T14:20:00Z'); // Tue 9:20am ET
const h = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);
const d = (days: number) => h(days * 24);

const g = (kind: AttentionKind, items: AttentionItem[], count = items.length): AttentionGroup => ({
	kind,
	result: ok({ count, items })
});

// --- DTSS admins -------------------------------------------------------------------

const unfilled = [
	{ id: 'rd1', requisitionId: 1042, createdAt: d(-3), dayStart: h(22.2), dayEnd: h(30.7), timezone: 'America/New_York', disciplineName: 'Dental Hygienist', companyName: 'Bright Smiles', locationName: 'Tampa' },
	{ id: 'rd2', requisitionId: 1043, createdAt: d(-1), dayStart: h(23.7), dayEnd: h(32), timezone: 'America/New_York', disciplineName: 'Dental Assistant', companyName: 'Coastal Dental', locationName: 'Clearwater' },
	{ id: 'rd3', requisitionId: 1047, createdAt: h(-5), dayStart: h(46), dayEnd: h(54), timezone: 'America/Chicago', disciplineName: 'Front Office', companyName: 'Harbor Dental Group', locationName: 'Pensacola' }
].map((r) => unfilledSoonItem(r, NOW));

const sheet = (id: string, first: string, last: string, company: string, discipline: string, hours: string, sinceDays: number) => ({
	id,
	weekBeginDate: '2026-11-01',
	totalHoursWorked: hours,
	since: d(-sinceDays),
	candidateFirstName: first,
	candidateLastName: last,
	companyName: company,
	disciplineName: discipline,
	locationName: company === 'Bright Smiles' ? 'Tampa' : 'Brandon'
});

export const adminGroups = (): AttentionGroup[] => [
	g('COMPLIANCE_CRITICAL', [
		complianceItem(
			{ subjectId: 'p1', subjectName: 'Jordan Ortiz', ruleKey: 'LICENSE:rdh', severity: 'CRITICAL', title: 'License · Dental Hygienist (RDH)', detail: 'License expired 2026-11-01', dueOn: '2026-11-01', upcomingShiftCount: 2, remindable: true, remindedAt: new Date(NOW.getTime() - 3 * 3_600_000).toISOString() },
			NOW
		)
	]),
	g('COMPLIANCE_BLOCKED', [
		complianceItem(
			{ subjectId: 'p2', subjectName: 'Priya Natarajan', ruleKey: 'CERTIFICATION:da', severity: 'BLOCKED', title: 'Certification · Dental Assistant (DA)', detail: 'Certification expired 2026-10-12', dueOn: '2026-10-12', upcomingShiftCount: 0, remindable: true, remindedAt: null },
			NOW
		)
	]),
	g('UNFILLED_SOON', unfilled),
	g('TIMESHEET_DISCREPANCY', [discrepancyItem(sheet('ts9', 'Jordan', 'Ortiz', 'Coastal Dental', 'Dental Assistant', '34.5', 2))]),
	g('INVOICE_OVERDUE', [
		overdueInvoiceItem({ id: 'inv1', invoiceNumber: 'INV-1043', amountRemaining: '820.00', dueDate: d(-12), createdAt: d(-42), companyName: 'Coastal Dental' }, 'admin', NOW)
	], 4),
	g('PERM_UNBILLED', [unbilledPlacementItem({ id: 1031, disciplineName: 'Dental Assistant', companyName: 'Coastal Dental', since: d(-6) }, NOW)]),
	g('TIMESHEET_PENDING', [
		pendingTimesheetItem(sheet('ts1', 'Maria', 'Chen', 'Bright Smiles', 'Dental Hygienist', '32.5', 1), { audience: 'admin', canApprove: true }),
		pendingTimesheetItem(sheet('ts2', 'Sam', 'Okafor', 'Harbor Dental Group', 'Front Office', '40', 1), { audience: 'admin', canApprove: true })
	]),
	g('PERM_APPLICANTS_WAITING', [
		permApplicantsItem({ requisitionId: 1019, disciplineName: 'Dental Hygienist', companyName: 'Oak Street Family Dentistry', locationName: 'Orlando', waiting: 3, oldest: d(-5) }, 'admin', NOW)
	]),
	g('PRO_PENDING_APPROVAL', [
		pendingProfessionalItem({ id: 'c1', firstName: 'Michelle', lastName: 'Chen', createdAt: d(-1), disciplines: 'RDH' }, NOW),
		pendingProfessionalItem({ id: 'c2', firstName: 'Luis', lastName: 'Ramos', createdAt: d(-2), disciplines: 'DA' }, NOW)
	], 14),
	g('CLIENT_PENDING_APPROVAL', [pendingClientItem({ id: 'cl1', companyName: 'Sunrise Pediatric Dentistry', firstName: 'Ana', lastName: 'Lopez', createdAt: d(-2) }, NOW)]),
	g('SUPPORT_OPEN', [
		supportItem({ id: 'st1', ticketNumber: 88, title: "Can't upload my CPR card", status: 'NEW', reporterFirstName: 'Kim', reporterLastName: 'Nguyen', updatedAt: h(-6), createdAt: h(-6) })
	])
];

export const emptyGroups = (): AttentionGroup[] =>
	adminGroups().map((x) => ({ kind: x.kind, result: ok({ count: 0, items: [] }) }));

export const failedGroups = (): AttentionGroup[] =>
	adminGroups().map((x, i) => (i === 3 || i === 4 ? { kind: x.kind, result: { ok: false as const } } : x));

const LOCS = [
	['l1', 'Tampa', 'Bright Smiles'],
	['l2', 'Clearwater', 'Coastal Dental'],
	['l3', 'Pensacola', 'Harbor Dental Group'],
	['l4', 'Orlando', 'Oak Street Family Dentistry'],
	['l5', 'Brandon', 'Bright Smiles'],
	['l6', 'St. Petersburg', 'Gulf Coast Smiles']
] as const;

export const coverageDays = nextBusinessDays(7, NOW);

const PEOPLE = ['Maria Chen', 'Sam Okafor', 'Jordan Ortiz', 'Priya Natarajan', 'Kim Nguyen', 'Luis Ramos'];
const DISCIPLINES = ['Dental Hygienist', 'Dental Assistant', 'Front Office'];

export function coverageShifts(): CoverageShift[] {
	const out: CoverageShift[] = [];
	let seed = 7;
	const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
	LOCS.forEach(([locationId, locationName, companyName], li) => {
		coverageDays.forEach((date, di) => {
			const weekend = new Date(`${date}T12:00:00Z`).getUTCDay() % 6 === 0;
			const total = weekend ? 0 : Math.floor(rnd() * (li < 2 ? 4 : 3));
			for (let k = 0; k < total; k++) {
				const filled = rnd() > (di < 2 ? 0.35 : 0.5);
				const start = new Date(`${date}T${String(12 + k).padStart(2, '0')}:30:00Z`);
				out.push({
					id: `${locationId}-${date}-${k}`,
					requisitionId: 1000 + li * 10 + k,
					locationId,
					locationName,
					companyName,
					date,
					dayStart: start,
					dayEnd: new Date(start.getTime() + 8.5 * 3_600_000),
					timezone: 'America/New_York',
					status: filled ? 'FILLED' : 'OPEN',
					disciplineName: DISCIPLINES[(li + k) % 3],
					professionalName: filled ? PEOPLE[(li + di + k) % PEOPLE.length] : null
				});
			}
		});
	});
	return out;
}

const series = (n: number, base: number, spread: number) =>
	Array.from({ length: n }, (_, i) => Math.max(0, base + Math.sin(i * 1.3) * spread + i * (spread / n)));

export const kpis = (): AdminKpis => ({
	window: 'month',
	fillRate: ok({ current: 0.92, previous: 0.88, series: series(10, 0.88, 0.05).map((v, i) => (i === 3 ? null : Math.min(1, v))) }),
	timeToFill: ok({ current: 190, previous: 240, series: series(10, 220, 60), sample: 61 }),
	billed: ok({ current: 48_210, previous: 43_900, series: series(10, 4_800, 1_600) }),
	wagesOwed: ok({ amount: 12_140.5, count: 23 })
});

export const failedKpis = (): AdminKpis => ({ ...kpis(), timeToFill: failed(), billed: failed() });

export const pipeline = ok({
	OPEN: { count: 41, wagesCents: 1_640_000, marginCents: 246_000, billingCents: 1_886_000 },
	FILLED: { count: 212, wagesCents: 8_380_000, marginCents: 1_257_000, billingCents: 9_637_000 },
	UNFULFILLED: { count: 3, wagesCents: 96_000, marginCents: 14_400, billingCents: 110_400 },
	CANCELED: { count: 9, wagesCents: 310_000, marginCents: 46_500, billingCents: 356_500 }
});

export const receivables = ok({
	current: { count: 18, amount: 22_040 },
	'1-30': { count: 7, amount: 8_120 },
	'31-60': { count: 2, amount: 1_200 },
	'60+': { count: 0, amount: 0 }
});

export const permPipeline = ok({ open: 9, interested: 34, applied: 11, recommended: 4, hired: 2 });

const comp = (severity: string, name: string, title: string, detail: string, remindedAt: string | null = null, snoozedUntil: string | null = null) => ({
	subjectId: name.toLowerCase().replace(/\W/g, ''),
	subjectName: name,
	ruleKey: `${title}:${severity}`,
	severity,
	title,
	detail,
	snoozedUntil,
	remindable: true,
	remindedAt
});

export const compliance = complianceSection(
	ok([
		comp('CRITICAL', 'Jordan Ortiz', 'License · Dental Hygienist (RDH)', 'License expired 2026-11-01'),
		comp('BLOCKED', 'Priya Natarajan', 'Certification · Dental Assistant (DA)', 'Certification expired 2026-10-12'),
		comp('ACTION', 'Michelle Chen', 'License · Dental Hygienist (RDH)', 'No license on file — 9 days of grace left'),
		comp('ACTION', 'Kim Nguyen', 'Certification · Dental Assistant (DA)', 'Certification required but no certificate on file'),
		comp('WATCH', 'Sam Okafor', 'License · Dental Hygienist (RDH)', 'License expires 2026-11-20 (10 days)', new Date(NOW.getTime() - 5 * 3_600_000).toISOString()),
		comp('WATCH', 'Luis Ramos', 'Certification · CPR', 'Certification expires 2026-12-28 (48 days)'),
		comp('WATCH', 'Ana Lopez', 'License · Dental Assistant (DA)', 'License expires 2026-12-30 (50 days)', null, '2026-11-24')
	])
);

// --- Practices ---------------------------------------------------------------------

const TAMPA = { id: 'l1', name: 'Tampa' };
const BRANDON = { id: 'l5', name: 'Brandon' };
const WESTCHASE = { id: 'l7', name: 'Westchase' };

export function scopeFor(audience: string): DashboardScope {
	const base: DashboardScope = {
		kind: 'company',
		clientId: 'client-1',
		companyId: 'co-1',
		locationIds: null,
		locations: [TAMPA, BRANDON, WESTCHASE],
		availableLocations: [TAMPA, BRANDON, WESTCHASE],
		chosen: false,
		label: 'All locations',
		can: capabilitiesFor('CLIENT'),
		ownerName: 'Dana Ruiz',
		ownerEmail: 'dana@brightsmiles.example'
	};
	if (audience === 'manager')
		return { ...base, kind: 'locations', locationIds: [TAMPA.id, BRANDON.id], locations: [TAMPA, BRANDON], availableLocations: [TAMPA, BRANDON], label: 'Tampa, Brandon', can: capabilitiesFor('CLIENT_STAFF', 'CLIENT_MANAGER') };
	if (audience === 'employee')
		return { ...base, kind: 'locations', locationIds: [TAMPA.id], locations: [TAMPA], availableLocations: [TAMPA], label: 'Tampa', can: capabilitiesFor('CLIENT_STAFF', 'CLIENT_EMPLOYEE') };
	if (audience === 'nolocations')
		return { ...base, kind: 'locations', locationIds: [], locations: [], availableLocations: [], label: 'No locations', can: capabilitiesFor('CLIENT_STAFF', 'CLIENT_EMPLOYEE') };
	return base;
}

export function practiceGroups(scope: DashboardScope): AttentionGroup[] {
	const approver = 'Dana (owner)';
	const ts = (id: string, first: string, last: string, discipline: string, hours: string, loc: string) => ({
		...sheet(id, first, last, 'Bright Smiles', discipline, hours, 1),
		locationName: loc
	});
	const groups: AttentionGroup[] = [
		g('TIMESHEET_PENDING', [
			pendingTimesheetItem(ts('t1', 'Maria', 'Chen', 'Dental Hygienist', '32.5', 'Tampa'), { audience: 'practice', canApprove: scope.can.approveTimesheets, approverName: approver }),
			pendingTimesheetItem(ts('t2', 'Sam', 'Okafor', 'Dental Assistant', '38', 'Brandon'), { audience: 'practice', canApprove: scope.can.approveTimesheets, approverName: approver })
		]),
		g('PERM_APPLICANTS_WAITING', [
			permApplicantsItem({ requisitionId: 1019, disciplineName: 'Dental Assistant', companyName: 'Bright Smiles', locationName: 'Tampa', waiting: 2, oldest: d(-2) }, 'practice', NOW)
		])
	];
	if (scope.can.viewBilling) {
		groups.push(
			g('INVOICE_DUE', [dueInvoiceItem({ id: 'i2', invoiceNumber: 'INV-1043', amountRemaining: '820.00', dueDate: d(3), createdAt: d(-27), companyName: null, candidateFirstName: 'Maria', candidateLastName: 'Chen', weekBeginDate: '2026-10-18', hostedUrl: 'https://invoice.stripe.com/example', invoiceMethod: 'STRIPE' }, NOW)]),
			g('INVOICE_OVERDUE', [overdueInvoiceItem({ id: 'i1', invoiceNumber: 'INV-1031', amountRemaining: '1560.00', dueDate: d(-4), createdAt: d(-34), companyName: null, candidateFirstName: 'Maria', candidateLastName: 'Chen', weekBeginDate: '2026-10-18', hostedUrl: null, invoiceMethod: 'STRIPE' }, 'practice', NOW)])
		);
	}
	if (scope.can.manageStaff) {
		groups.push(g('STAFF_NO_LOCATION', [staffNoLocationItem({ id: 's1', firstName: 'Riley', lastName: 'Park', createdAt: d(-3) })]));
		groups.push(g('SIGNATURE_PENDING', [signatureItem({ id: 'sig1', title: 'Staffing services agreement', signingUrl: 'https://example.com/sign' }, NOW)]));
	}
	return groups;
}

export function practiceShifts(scope: DashboardScope): CoverageShift[] {
	const days = nextBusinessDays(14, NOW);
	const out: CoverageShift[] = [];
	const locs = scope.locationIds === null ? [TAMPA, BRANDON, WESTCHASE] : scope.locations;
	[1, 2, 2, 3, 5, 8].forEach((di, k) => {
		const loc = locs[k % locs.length];
		if (!loc) return;
		const date = days[di];
		const start = new Date(`${date}T12:30:00Z`);
		const filled = k !== 2 && k !== 4;
		out.push({
			id: `ps${k}`,
			requisitionId: 2000 + k,
			locationId: loc.id,
			locationName: loc.name,
			companyName: 'Bright Smiles',
			date,
			dayStart: start,
			dayEnd: new Date(start.getTime() + 8.5 * 3_600_000),
			timezone: 'America/New_York',
			status: filled ? 'FILLED' : 'OPEN',
			disciplineName: DISCIPLINES[k % 3],
			professionalName: filled ? PEOPLE[k] : null
		});
	});
	return out;
}

export const glance = (scope: DashboardScope) => ({
	openRequests: ok(4),
	shiftsThisMonth: ok({ filled: 18, total: 20 }),
	balance: scope.can.viewBilling ? ok({ due: 2380, dueCount: 3, overdue: 1560, overdueCount: 1, paidThisMonth: 4120, timesheetsAwaiting: 2, expensesPending: 86.5, expensesPendingCount: 2 }) : null
});

// --- Trends and agreements -------------------------------------------------
const trendWeeks = weeksAround(NOW, 12);
const rates = [0.84, 0.88, 0.9, 0.86, null, 0.91, 0.93, 0.89, 0.94, 0.92, 0.95, 0.9];
export const trends = ok<AdminTrends>({
	fillRate: trendWeeks.map((w, i) => {
		const total = rates[i] === null ? 0 : 40 + i * 2;
		const filled = rates[i] === null ? 0 : Math.round((rates[i] as number) * total);
		return { week: w.key, label: w.label, rate: total ? filled / total : null, filled, total };
	}),
	money: trendWeeks.map((w, i) => ({ week: w.key, label: w.label, billed: 9000 + i * 650 + (i % 3) * 900, margin: 2400 + i * 160 + (i % 3) * 210 })),
	shiftsByStatus: weeksAround(NOW, 8, 4).map((w, i) => ({
		week: w.key,
		label: w.label,
		future: i >= 8,
		FILLED: i >= 8 ? 20 + i : 38 + (i % 4) * 3,
		OPEN: i >= 8 ? 14 - i : 0,
		UNFULFILLED: i >= 8 ? 0 : 3 + (i % 3),
		CANCELED: 1 + (i % 2)
	})),
	topPractices: [
		{ clientId: 'c1', name: 'Bright Smiles Tampa', billed: 48250, invoices: 14 },
		{ clientId: 'c2', name: 'Gulf Coast Family Dental', billed: 31900, invoices: 11 },
		{ clientId: 'c3', name: 'Westchase Dental Arts', billed: 22480, invoices: 9 },
		{ clientId: 'c4', name: 'Brandon Pediatric Dentistry', billed: 15120, invoices: 6 },
		{ clientId: 'c5', name: 'Seaside Orthodontics', billed: 8740, invoices: 3 }
	]
});

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
export const agreements = ok(
	agreementStatus([
		{ clientId: 'a1', name: 'Seaside Orthodontics', clientCreatedAt: daysAgo(30), latest: null, everCompleted: false, hasUploadedAgreement: false },
		{ clientId: 'a2', name: 'Lakeland Smiles', clientCreatedAt: daysAgo(9), latest: null, everCompleted: false, hasUploadedAgreement: false },
		{ clientId: 'a3', name: 'Brandon Pediatric Dentistry', clientCreatedAt: daysAgo(40), latest: { status: 'OPENED', sentAt: daysAgo(12), subjectSignedAt: null, createdAt: daysAgo(12) }, everCompleted: false, hasUploadedAgreement: false },
		{ clientId: 'a4', name: 'Clearwater Family Dental', clientCreatedAt: daysAgo(20), latest: { status: 'SENT', sentAt: daysAgo(3), subjectSignedAt: null, createdAt: daysAgo(3) }, everCompleted: false, hasUploadedAgreement: false },
		{ clientId: 'a5', name: 'Westchase Dental Arts', clientCreatedAt: daysAgo(60), latest: { status: 'AWAITING_COUNTERSIGN', sentAt: daysAgo(8), subjectSignedAt: daysAgo(2), createdAt: daysAgo(8) }, everCompleted: false, hasUploadedAgreement: false },
		{ clientId: 'a6', name: 'Bright Smiles Tampa', clientCreatedAt: daysAgo(90), latest: { status: 'COMPLETED', sentAt: daysAgo(80), subjectSignedAt: daysAgo(79), createdAt: daysAgo(80) }, everCompleted: true, hasUploadedAgreement: false }
	])
);
