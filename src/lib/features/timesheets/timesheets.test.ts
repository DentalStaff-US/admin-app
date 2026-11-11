// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	billingSummary,
	buildDayTable,
	entriesFromHoursRaw,
	latestShiftStarted,
	lunchHours,
	totalEntryHours,
	weekRangeLabel,
	withTime,
	workedHours
} from './timesheets';
import {
	countTabs,
	inTab,
	readTimesheetListQuery,
	shapeTimesheetList,
	toTimesheetListRow,
	type TimesheetListRow
} from './timesheetList';
import { auditToTimeline, countViews, practiceTimeline } from './history';

const TZ = 'America/New_York';
// 8:00am–4:30pm EST on Nov 3 2026 (UTC−5), 12:00–12:30 lunch.
const day = (date: string, start = '13:00', end = '21:30') => ({
	date,
	dayStart: `${date}T${start}:00Z`,
	dayEnd: `${date}T${end}:00Z`,
	lunchStart: `${date}T17:00:00Z`,
	lunchEnd: `${date}T17:30:00Z`
});

describe('weekRangeLabel', () => {
	it('spans seven days from the week start', () => {
		expect(weekRangeLabel('2026-11-02')).toBe('Nov 2 – Nov 8, 2026');
		expect(weekRangeLabel('2026-12-28')).toBe('Dec 28 – Jan 3, 2026');
	});
	it('handles missing dates', () => {
		expect(weekRangeLabel(null)).toBe('—');
	});
});

describe('buildDayTable', () => {
	const scheduledDays = [day('2026-11-03'), day('2026-11-04'), day('2026-11-05')];

	it('lists scheduled days and unscheduled logged days in date order', () => {
		const t = buildDayTable({
			scheduledDates: ['2026-11-05', '2026-11-03', '2026-11-04'],
			scheduledDays,
			hoursRaw: [
				{ date: '2026-11-07', hours: 4, startTime: '2026-11-07T14:00:00Z', endTime: '2026-11-07T18:00:00Z' },
				{ date: '2026-11-03', hours: 8, startTime: '2026-11-03T13:00:00Z', endTime: '2026-11-03T21:30:00Z', lunchStartTime: '2026-11-03T17:00:00Z', lunchEndTime: '2026-11-03T17:30:00Z' }
			],
			timeZone: TZ
		});
		expect(t.rows.map((r) => r.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-07']);
		const [first, , , extra] = t.rows;
		expect(first.dayLabel).toBe('Tue, Nov 3');
		expect(first.scheduledStart).toBe('8:00 AM');
		expect(first.actualEnd).toBe('4:30 PM');
		expect(first.scheduledHours).toBe(8);
		expect(first.breakHours).toBe(0.5);
		expect(first.discrepancy).toBeNull();
		expect(extra.discrepancy).toBe('Not on the schedule');
		expect(t.totals.hours).toBe(12);
	});

	it('flags times more than the tolerance off schedule', () => {
		const t = buildDayTable({
			scheduledDates: ['2026-11-03'],
			scheduledDays,
			hoursRaw: [{ date: '2026-11-03', hours: 7.5, startTime: '2026-11-03T13:25:00Z', endTime: '2026-11-03T21:10:00Z' }],
			timeZone: TZ
		});
		expect(t.rows[0].discrepancy).toBe('Started 25 min late · Finished 20 min early');
	});

	it('flags scheduled days with no hours only once submitted', () => {
		const base = { scheduledDates: ['2026-11-04'], scheduledDays, hoursRaw: [], timeZone: TZ };
		expect(buildDayTable(base).rows[0].discrepancy).toBeNull();
		expect(buildDayTable({ ...base, flagMissing: true }).rows[0].discrepancy).toBe('No hours logged');
	});

	it('splits regular and overtime across the week, after earlier sheets', () => {
		const hoursRaw = ['2026-11-03', '2026-11-04', '2026-11-05'].map((date) => ({
			date,
			hours: 10,
			startTime: `${date}T13:00:00Z`,
			endTime: `${date}T23:00:00Z`
		}));
		const t = buildDayTable({ scheduledDates: [], scheduledDays: [], hoursRaw, timeZone: TZ, priorWeekHours: 15 });
		expect(t.rows.map((r) => [r.regular, r.overtime])).toEqual([
			[10, 0],
			[10, 0],
			[5, 5]
		]);
		expect(t.totals).toMatchObject({ hours: 30, regular: 25, overtime: 5 });
	});
});

describe('billingSummary', () => {
	it('bills overtime at 1.5x and the percentage fee on regular hours only', () => {
		const s = billingSummary({
			hours: 45,
			rate: 40,
			adminFee: { amount: 10, type: 'PERCENTAGE' },
			approvedExpensesTotal: 12.5
		});
		expect(s.regularHours).toBe(40);
		expect(s.overtimeHours).toBe(5);
		expect(s.regularAmount).toBe(1600);
		expect(s.overtimeAmount).toBe(300);
		expect(s.adminFeeAmount).toBe(160);
		expect(s.total).toBe(1600 + 300 + 160 + 12.5);
	});
	it('continues the weekly split from earlier sheets and takes a flat fee as-is', () => {
		const s = billingSummary({ hours: 10, rate: 30, priorWeekHours: 35, adminFee: { amount: 250, type: 'FIXED' } });
		expect(s.regularHours).toBe(5);
		expect(s.overtimeHours).toBe(5);
		expect(s.adminFeeAmount).toBe(250);
	});
	it('a zero fee is no fee', () => {
		expect(billingSummary({ hours: 8, rate: 50, adminFee: { amount: 0, type: 'PERCENTAGE' } }).adminFeeAmount).toBe(0);
	});
});

describe('hours editor', () => {
	it('computes worked hours minus an unpaid break', () => {
		expect(workedHours('08:00', '16:30', '12:00', '12:30')).toBe(8);
		expect(workedHours('08:00', '')).toBe(0);
		expect(lunchHours('12:30', '12:00')).toBe(0);
	});

	it('prefills from hours_raw in the requisition zone and keeps the workday id', () => {
		const entries = entriesFromHoursRaw(
			['2026-11-03', '2026-11-04'],
			[{ date: '2026-11-03', hours: 8, startTime: '2026-11-03T13:00:00Z', endTime: '2026-11-03T21:30:00Z', lunchStartTime: '2026-11-03T17:00:00Z', lunchEndTime: '2026-11-03T17:30:00Z' }],
			{ '2026-11-03': 'wd-1', '2026-11-04': 'wd-2' },
			TZ
		);
		expect(entries['2026-11-03']).toEqual({
			startTime: '08:00',
			endTime: '16:30',
			lunchStartTime: '12:00',
			lunchEndTime: '12:30',
			hours: 8,
			workdayId: 'wd-1'
		});
		expect(entries['2026-11-04'].workdayId).toBe('wd-2');
		expect(totalEntryHours(entries)).toBe(8);
	});

	it('recomputes a day when a time changes', () => {
		let entries = entriesFromHoursRaw(['2026-11-04'], [], { '2026-11-04': 'wd-2' }, TZ);
		entries = withTime(entries, '2026-11-04', 'startTime', '09:00');
		entries = withTime(entries, '2026-11-04', 'endTime', '15:00');
		expect(entries['2026-11-04']).toMatchObject({ hours: 6, workdayId: 'wd-2' });
	});

	it('unlocks submission once the last linked shift has started', () => {
		const workdays = [
			{ recurrenceDay: { date: '2026-11-03', dayStart: '2026-11-03T13:00:00Z' } },
			{ recurrenceDay: { date: '2026-11-05', dayStart: '2026-11-05T13:00:00Z' } }
		];
		expect(latestShiftStarted(workdays, TZ, new Date('2026-11-05T12:59:00Z'))).toBe(false);
		expect(latestShiftStarted(workdays, TZ, new Date('2026-11-05T13:00:00Z'))).toBe(true);
		expect(latestShiftStarted([], TZ)).toBe(true);
	});
});

describe('timesheet list', () => {
	const raw = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
		timesheet: { id, status, wagesStatus: null, totalHoursWorked: '8', weekBeginDate: '2026-11-02', ...extra },
		requisition: { id: 7, disciplineName: 'Dental Hygienist' },
		clientCompany: { companyName: 'Bright Smiles' },
		candidate: { firstName: 'Maria', lastName: 'Lopez' }
	});
	const rows: TimesheetListRow[] = [
		raw('a', 'PENDING'),
		raw('b', 'DISCREPANCY'),
		raw('c', 'APPROVED', { wagesStatus: 'WAGES_DUE' }),
		raw('d', 'APPROVED', { wagesStatus: 'WAGES_PAID', totalHoursWorked: '40' }),
		raw('e', 'VOID'),
		raw('f', 'DRAFT')
	].map(toTimesheetListRow);

	it('shapes a row', () => {
		expect(rows[0]).toMatchObject({
			id: 'a',
			professional: 'Maria Lopez',
			practice: 'Bright Smiles',
			discipline: 'Dental Hygienist',
			requisitionId: 7,
			weekLabel: 'Nov 2 – Nov 8, 2026',
			hours: 8
		});
	});

	it('counts each tab, keeping voided sheets out of the rest', () => {
		expect(countTabs(rows)).toEqual({ review: 1, discrepancies: 1, approved: 1, paid: 1, all: 5, voided: 1 });
		expect(inTab(rows[4], 'all')).toBe(false);
	});

	it('reads the query with safe defaults', () => {
		const q = readTimesheetListQuery(new URL('http://x/timesheets?tab=nope&practice=A,B&sort=hours&dir=asc&page=2'));
		expect(q).toMatchObject({ tab: 'review', practice: ['A', 'B'], sort: { column: 'hours', direction: 'asc' }, page: 2 });
		expect(readTimesheetListQuery(new URL('http://x/timesheets?sort=evil')).sort).toEqual({ column: 'week', direction: 'desc' });
	});

	it('filters, sorts, pages and clamps the page', () => {
		const q = readTimesheetListQuery(new URL('http://x/timesheets?tab=all&sort=hours&dir=desc&page=9'));
		const out = shapeTimesheetList(rows, q, 2);
		expect(out.total).toBe(5);
		expect(out.page).toBe(3);
		expect(out.rows.map((r) => r.id)).toHaveLength(1);
		const first = shapeTimesheetList(rows, { ...q, page: 1 }, 2);
		expect(first.rows[0].id).toBe('d');

		const wages = shapeTimesheetList(rows, { ...q, page: 1, wages: ['WAGES_DUE'] }, 20);
		expect(wages.rows.map((r) => r.id)).toEqual(['c']);
		expect(wages.counts.approved).toBe(1);
		expect(wages.counts.review).toBe(0);
	});
});

describe('history', () => {
	const entry = (id: string, action: string, extra: Record<string, unknown> = {}) => ({
		id,
		createdAt: new Date(`2026-11-0${id}T12:00:00Z`),
		action,
		entityType: 'TIMESHEETS',
		entityId: 't1',
		userId: 'u1',
		actorName: 'Shannon Carter',
		actorEmail: null,
		actorRole: 'SUPERADMIN',
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

	it('hides views unless asked, newest first, and names expense rows', () => {
		const entries = [entry('1', 'SUBMIT'), entry('2', 'VIEW'), entry('3', 'DELETE', { metadata: { kind: 'TIMESHEET_EXPENSE' } })];
		const tl = auditToTimeline(entries);
		expect(tl.map((e) => e.id)).toEqual(['3', '1']);
		expect(tl[0]).toMatchObject({ actor: 'Shannon Carter (Admin)', text: 'deleted an expense', tone: 'negative' });
		expect(tl[1]).toMatchObject({ text: 'submitted this timesheet', tone: 'pending' });
		expect(auditToTimeline(entries, { includeViews: true })).toHaveLength(3);
		expect(countViews(entries)).toBe(1);
	});

	it('derives the practice trail from the sheet and its expenses', () => {
		const tl = practiceTimeline(
			{ createdAt: '2026-11-03T10:00:00Z', updatedAt: '2026-11-08T10:00:00Z', status: 'DISCREPANCY', discrepancyNote: 'Tuesday was a half day' },
			[{ id: 'x', description: 'Parking', amountCents: 1200, status: 'REJECTED', createdAt: '2026-11-04T10:00:00Z', updatedAt: '2026-11-05T10:00:00Z', rejectionReason: 'No receipt' }]
		);
		expect(tl.map((e) => e.text)).toEqual([
			'Sent back for correction: “Tuesday was a half day”',
			'Expense rejected: Parking ($12.00): “No receipt”',
			'Expense added: Parking ($12.00)',
			'Timesheet created'
		]);
	});
});
