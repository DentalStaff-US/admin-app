/**
 * Pure helpers for the timesheet screens: week labels, the per-day table, the
 * billing summary and the hours editor. Framework-free so they can be tested
 * and shared by the admin (TimesheetAdmin) and practice (TimesheetReview)
 * views, which used to carry two copies of this logic in one 2,300-line page.
 */
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export type TimesheetStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'DISCREPANCY' | 'REJECTED' | 'VOID';

/** One entry of `timesheets.hours_raw` (see RawTimesheetHours in the schema). */
export type HoursRawEntry = {
	date: string;
	workdayId?: string;
	recurrenceDayId?: string;
	hours: number;
	startTime: string;
	endTime: string;
	lunchStartTime?: string | null;
	lunchEndTime?: string | null;
};

/** The scheduled shift for a date (a recurrence day). */
export type ScheduledDay = {
	date: string;
	dayStart: string | Date | null;
	dayEnd: string | Date | null;
	lunchStart?: string | Date | null;
	lunchEnd?: string | Date | null;
};

const HOUR_MS = 3_600_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Week label

/** "Nov 3 – Nov 9, 2026" for a week starting on `weekBeginDate` (a date column). */
export function weekRangeLabel(weekBeginDate: string | Date | null | undefined): string {
	if (!weekBeginDate) return '—';
	const start = new Date(weekBeginDate);
	if (Number.isNaN(start.getTime())) return '—';
	const end = new Date(start);
	end.setUTCDate(start.getUTCDate() + 6);
	const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
	return `${fmt(start)} – ${fmt(end)}, ${start.getUTCFullYear()}`;
}

/** "America/New_York" → "New York" (how the old page labelled the zone). */
export function timeZoneName(timeZone: string): string {
	return timeZone.split('/')[1]?.replace(/_/g, ' ') || timeZone;
}

/** The requisition's zone, as the old page resolved it. */
export function requisitionTimeZone(requisition: {
	location?: { timezone?: string | null } | null;
	referenceTimezone?: string | null;
} | null | undefined): string {
	return requisition?.location?.timezone || requisition?.referenceTimezone || 'America/New_York';
}

// ---------------------------------------------------------------------------
// Day-by-day table

export type DayRow = {
	date: string;
	dayLabel: string;
	scheduledStart: string | null;
	scheduledEnd: string | null;
	scheduledHours: number | null;
	actualStart: string | null;
	actualEnd: string | null;
	breakHours: number | null;
	hours: number | null;
	regular: number;
	overtime: number;
	/** Why this day reads differently from the schedule, or null. */
	discrepancy: string | null;
};

export type DayTable = {
	rows: DayRow[];
	totals: { hours: number; regular: number; overtime: number; scheduledHours: number };
};

function fmtTime(value: string | Date | null | undefined, timeZone: string): string | null {
	if (!value) return null;
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return null;
	return formatInTimeZone(d, timeZone, 'h:mm a');
}

function dayLabel(date: string): string {
	const d = new Date(`${date}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return date;
	return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function spanHours(start: string | Date | null | undefined, end: string | Date | null | undefined): number {
	if (!start || !end) return 0;
	const ms = new Date(end).getTime() - new Date(start).getTime();
	return Number.isFinite(ms) && ms > 0 ? ms / HOUR_MS : 0;
}

function minutesApart(a: string | Date, b: string | Date): number {
	return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60_000);
}

function drift(label: 'Started' | 'Finished', minutes: number): string {
	return `${label} ${Math.abs(minutes)} min ${minutes > 0 ? 'late' : 'early'}`;
}

/**
 * One row per scheduled date (from the sheet's workdays) plus any logged date
 * that isn't on the schedule, in date order. Regular and overtime split the
 * week the way billing does: the first `40 - priorWeekHours` hours are regular
 * (earlier sheets this week already used the rest), everything after is OT.
 *
 * A row is flagged when it doesn't match the schedule: hours on an unscheduled
 * day, a start or finish more than `toleranceMinutes` off, or (once the sheet
 * has been submitted) a scheduled day with no hours.
 */
export function buildDayTable(input: {
	scheduledDates: string[];
	scheduledDays: ScheduledDay[];
	hoursRaw: HoursRawEntry[] | null | undefined;
	timeZone: string;
	priorWeekHours?: number;
	flagMissing?: boolean;
	toleranceMinutes?: number;
}): DayTable {
	const { timeZone, priorWeekHours = 0, flagMissing = false, toleranceMinutes = 15 } = input;
	const hoursRaw = input.hoursRaw ?? [];
	const scheduledByDate = new Map(input.scheduledDays.map((d) => [d.date, d]));
	const scheduled = new Set(input.scheduledDates.filter(Boolean));
	const dates = [...new Set([...scheduled, ...hoursRaw.map((e) => e.date)])].sort();

	let allotment = Math.max(0, 40 - priorWeekHours);
	const totals = { hours: 0, regular: 0, overtime: 0, scheduledHours: 0 };

	const rows = dates.map((date): DayRow => {
		const entry = hoursRaw.find((e) => e.date === date) ?? null;
		const plan = scheduledByDate.get(date) ?? null;
		const onSchedule = scheduled.has(date);

		const scheduledHours = plan
			? round2(spanHours(plan.dayStart, plan.dayEnd) - spanHours(plan.lunchStart, plan.lunchEnd))
			: null;
		const hours = entry ? Number(entry.hours) || 0 : null;
		const breakHours = entry ? round2(spanHours(entry.lunchStartTime, entry.lunchEndTime)) : null;

		const regular = hours ? Math.min(hours, allotment) : 0;
		allotment -= regular;
		const overtime = hours ? round2(hours - regular) : 0;

		const reasons: string[] = [];
		if (entry && !onSchedule) reasons.push('Not on the schedule');
		if (!entry && onSchedule && flagMissing) reasons.push('No hours logged');
		if (entry && plan?.dayStart && entry.startTime) {
			const m = minutesApart(entry.startTime, plan.dayStart);
			if (Math.abs(m) > toleranceMinutes) reasons.push(drift('Started', m));
		}
		if (entry && plan?.dayEnd && entry.endTime) {
			const m = minutesApart(entry.endTime, plan.dayEnd);
			if (Math.abs(m) > toleranceMinutes) reasons.push(drift('Finished', m));
		}

		if (hours) totals.hours += hours;
		totals.regular += regular;
		totals.overtime += overtime;
		if (onSchedule && scheduledHours) totals.scheduledHours += scheduledHours;

		return {
			date,
			dayLabel: dayLabel(date),
			scheduledStart: fmtTime(plan?.dayStart, timeZone),
			scheduledEnd: fmtTime(plan?.dayEnd, timeZone),
			scheduledHours,
			actualStart: fmtTime(entry?.startTime, timeZone),
			actualEnd: fmtTime(entry?.endTime, timeZone),
			breakHours,
			hours,
			regular: round2(regular),
			overtime,
			discrepancy: reasons.length ? reasons.join(' · ') : null
		};
	});

	return {
		rows,
		totals: {
			hours: round2(totals.hours),
			regular: round2(totals.regular),
			overtime: round2(totals.overtime),
			scheduledHours: round2(totals.scheduledHours)
		}
	};
}

// ---------------------------------------------------------------------------
// Billing summary (same arithmetic the page always used; the fee itself is
// resolved server-side by resolveAdminFeeForDisplay)

export type FeeSettings = { amount: number; type: 'PERCENTAGE' | 'FIXED' };

export type BillingSummary = {
	regularHours: number;
	overtimeHours: number;
	regularAmount: number;
	overtimeAmount: number;
	subtotal: number;
	adminFeeAmount: number;
	expensesTotal: number;
	total: number;
};

export function billingSummary(input: {
	hours: number;
	rate: number;
	priorWeekHours?: number;
	adminFee: FeeSettings;
	approvedExpensesTotal?: number;
}): BillingSummary {
	const { hours, rate, priorWeekHours = 0, adminFee, approvedExpensesTotal = 0 } = input;
	const regularHours = Math.min(hours, Math.max(0, 40 - priorWeekHours));
	const overtimeHours = Math.max(0, hours - regularHours);
	const regularAmount = Number(rate) * regularHours;
	const overtimeAmount = overtimeHours * Number(rate) * 1.5;
	const subtotal = regularAmount + overtimeAmount;
	const adminFeeAmount =
		adminFee.amount > 0
			? adminFee.type === 'PERCENTAGE'
				? (regularAmount * adminFee.amount) / 100
				: adminFee.amount
			: 0;
	return {
		regularHours,
		overtimeHours,
		regularAmount,
		overtimeAmount,
		subtotal,
		adminFeeAmount,
		expensesTotal: approvedExpensesTotal,
		total: subtotal + approvedExpensesTotal + adminFeeAmount
	};
}

export const usd = (n: number) =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);

export const hoursText = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Number(n).toFixed(2));

/** "35%" or "$250.00". */
export const feeText = (amount: number | string, type: 'PERCENTAGE' | 'FIXED') =>
	type === 'PERCENTAGE' ? `${Number(amount)}%` : usd(Number(amount));

// ---------------------------------------------------------------------------
// Hours editor (admin "Edit hours")

export type TimeEntry = {
	startTime: string;
	endTime: string;
	lunchStartTime: string;
	lunchEndTime: string;
	hours: number;
	workdayId: string;
};

export type TimeField = 'startTime' | 'endTime' | 'lunchStartTime' | 'lunchEndTime';

/** Unpaid break length between two "HH:mm" values. */
export function lunchHours(start: string, end: string): number {
	if (!start || !end) return 0;
	const [sh, sm] = start.split(':').map(Number);
	const [eh, em] = end.split(':').map(Number);
	return Math.max(0, Math.round((eh - sh + (em - sm) / 60) * 100) / 100);
}

/** Worked hours between two "HH:mm" values, minus the break. */
export function workedHours(start: string, end: string, lunchStart = '', lunchEnd = ''): number {
	if (!start || !end) return 0;
	const [sh, sm] = start.split(':').map(Number);
	const [eh, em] = end.split(':').map(Number);
	const total = eh - sh + (em - sm) / 60;
	return Math.round((total - lunchHours(lunchStart, lunchEnd)) * 100) / 100;
}

const blankEntry = (workdayId = ''): TimeEntry => ({
	startTime: '',
	endTime: '',
	lunchStartTime: '',
	lunchEndTime: '',
	hours: 0,
	workdayId
});

/**
 * The editable entries for the scheduled dates, prefilled from hours_raw. Each
 * keeps its workdayId (the entry's own, else the date's workday) so the server
 * stores the stable key rather than deriving it from the date.
 */
export function entriesFromHoursRaw(
	scheduledDates: string[],
	hoursRaw: HoursRawEntry[] | null | undefined,
	workdayIdByDate: Record<string, string>,
	timeZone: string
): Record<string, TimeEntry> {
	const entries: Record<string, TimeEntry> = {};
	for (const date of scheduledDates) entries[date] = blankEntry(workdayIdByDate[date] ?? '');
	const hhmm = (v?: string | null) => (v ? formatInTimeZone(new Date(v), timeZone, 'HH:mm') : '');
	for (const entry of hoursRaw ?? []) {
		if (!entries[entry.date]) continue;
		entries[entry.date] = {
			startTime: hhmm(entry.startTime),
			endTime: hhmm(entry.endTime),
			lunchStartTime: hhmm(entry.lunchStartTime),
			lunchEndTime: hhmm(entry.lunchEndTime),
			hours: entry.hours || 0,
			workdayId: entry.workdayId || workdayIdByDate[entry.date] || ''
		};
	}
	return entries;
}

/** A copy of `entries` with one time changed and that day's hours recomputed. */
export function withTime(
	entries: Record<string, TimeEntry>,
	date: string,
	field: TimeField,
	value: string,
	workdayId = ''
): Record<string, TimeEntry> {
	const entry = { ...(entries[date] ?? blankEntry(workdayId)), [field]: value };
	entry.hours = workedHours(entry.startTime, entry.endTime, entry.lunchStartTime, entry.lunchEndTime);
	return { ...entries, [date]: entry };
}

export const totalEntryHours = (entries: Record<string, TimeEntry>) =>
	Object.values(entries).reduce((sum, e) => sum + (e.hours || 0), 0);

/**
 * Submission unlocks once the LAST shift linked to this sheet has started
 * (approval waits for it to end; that's `hasUnfinishedWorkdays` server-side).
 * Same comparison the page always made, in the requisition's zone.
 */
export function latestShiftStarted(
	workdays: { recurrenceDay?: { date?: string; dayStart?: string | Date | null } | null }[] | null | undefined,
	timeZone: string,
	now: Date = new Date()
): boolean {
	if (!workdays || workdays.length === 0) return true;
	const latest = [...workdays].sort(
		(a, b) => new Date(a.recurrenceDay?.date ?? 0).getTime() - new Date(b.recurrenceDay?.date ?? 0).getTime()
	)[workdays.length - 1];
	if (!latest?.recurrenceDay?.dayStart) return true;
	try {
		return toZonedTime(now, timeZone) >= toZonedTime(new Date(latest.recurrenceDay.dayStart), timeZone);
	} catch {
		return true;
	}
}
