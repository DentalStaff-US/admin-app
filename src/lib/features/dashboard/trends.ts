/**
 * Weekly trends for the DTSS admin dashboard: fill rate, billed vs. margin,
 * shifts by status and the top practices. Pure: the server reads rows and hands
 * them here, so the bucketing is tested without a database.
 *
 * Weeks are Monday-start in America/New_York, keyed by the Monday's date.
 */
import { addDays, addWeeks } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// Same list as SHIFT_STATUSES in server/shiftValueRule.ts, which can't be
// imported here: it pulls a $lib/server module and this file is client-safe.
export const SHIFT_STATUSES = ['OPEN', 'FILLED', 'UNFULFILLED', 'CANCELED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const TREND_TIMEZONE = 'America/New_York';
export const TREND_WEEKS_BACK = 12;
export const STATUS_WEEKS_BACK = 8;
export const STATUS_WEEKS_AHEAD = 4;
export const TOP_PRACTICES = 5;

export type Week = { key: string; start: Date; label: string };

/** The Monday (ET) of the week `date` falls in, as yyyy-MM-dd. */
export function weekKey(date: Date | string): string {
	const d = new Date(date);
	// ISO weekday: 1 = Monday … 7 = Sunday, in ET.
	const weekday = Number(formatInTimeZone(d, TREND_TIMEZONE, 'i'));
	const day = formatInTimeZone(d, TREND_TIMEZONE, 'yyyy-MM-dd');
	const monday = addDays(new Date(`${day}T12:00:00Z`), 1 - weekday);
	return monday.toISOString().slice(0, 10);
}

/** `back` weeks ending with this week, then `ahead` future weeks, oldest first. */
export function weeksAround(now: Date, back: number, ahead = 0): Week[] {
	const thisMonday = new Date(`${weekKey(now)}T12:00:00Z`);
	const weeks: Week[] = [];
	for (let i = -(back - 1); i <= ahead; i++) {
		const monday = addWeeks(thisMonday, i);
		const key = monday.toISOString().slice(0, 10);
		weeks.push({
			key,
			start: fromZonedTime(`${key}T00:00:00`, TREND_TIMEZONE),
			label: formatInTimeZone(monday, 'UTC', 'MMM d')
		});
	}
	return weeks;
}

export type FillRatePoint = { week: string; label: string; rate: number | null; filled: number; total: number };

/** Filled ÷ (filled + unfulfilled) per week, by shift start. null = no shifts that week. */
export function fillRateByWeek(shifts: { status: string; dayStart: Date | string }[], weeks: Week[]): FillRatePoint[] {
	const tally = new Map(weeks.map((w) => [w.key, { filled: 0, total: 0 }]));
	for (const s of shifts) {
		if (s.status !== 'FILLED' && s.status !== 'UNFULFILLED') continue;
		const t = tally.get(weekKey(s.dayStart));
		if (!t) continue;
		t.total += 1;
		if (s.status === 'FILLED') t.filled += 1;
	}
	return weeks.map((w) => {
		const t = tally.get(w.key)!;
		return { week: w.key, label: w.label, rate: t.total ? t.filled / t.total : null, ...t };
	});
}

export type MoneyPoint = { week: string; label: string; billed: number; margin: number };

/**
 * Billed = invoices raised that week (no drafts or voids), in dollars.
 * Margin = the platform fee on shifts worked that week (the pipeline estimate).
 */
export function moneyByWeek(
	invoices: { total: number; createdAt: Date | string }[],
	marginCentsByWeek: Map<string, number>,
	weeks: Week[]
): MoneyPoint[] {
	const billed = new Map(weeks.map((w) => [w.key, 0]));
	for (const inv of invoices) {
		const k = weekKey(inv.createdAt);
		if (billed.has(k)) billed.set(k, billed.get(k)! + (Number(inv.total) || 0));
	}
	return weeks.map((w) => ({
		week: w.key,
		label: w.label,
		billed: Math.round(billed.get(w.key)! * 100) / 100,
		margin: Math.round(marginCentsByWeek.get(w.key) ?? 0) / 100
	}));
}

export type StatusPoint = { week: string; label: string; future: boolean } & Record<ShiftStatus, number>;

/** Shift counts per week split by status, past weeks and the weeks ahead. */
export function shiftsByStatusWeek(
	shifts: { status: string; dayStart: Date | string }[],
	weeks: Week[],
	now: Date
): StatusPoint[] {
	const current = weekKey(now);
	const empty = () => Object.fromEntries(SHIFT_STATUSES.map((s) => [s, 0])) as Record<ShiftStatus, number>;
	const tally = new Map(weeks.map((w) => [w.key, empty()]));
	for (const s of shifts) {
		if (!(SHIFT_STATUSES as readonly string[]).includes(s.status)) continue;
		const t = tally.get(weekKey(s.dayStart));
		if (t) t[s.status as ShiftStatus] += 1;
	}
	return weeks.map((w) => ({ week: w.key, label: w.label, future: w.key > current, ...tally.get(w.key)! }));
}

export type PracticeRank = { clientId: string; name: string; billed: number; invoices: number };

/** The practices invoiced the most in the period, largest first. */
export function topPractices(
	invoices: { clientId: string; total: number }[],
	names: Map<string, string>,
	limit = TOP_PRACTICES
): PracticeRank[] {
	const totals = new Map<string, { billed: number; invoices: number }>();
	for (const inv of invoices) {
		const t = totals.get(inv.clientId) ?? { billed: 0, invoices: 0 };
		t.billed += Number(inv.total) || 0;
		t.invoices += 1;
		totals.set(inv.clientId, t);
	}
	return [...totals.entries()]
		.filter(([, t]) => t.billed > 0)
		.map(([clientId, t]) => ({ clientId, name: names.get(clientId) ?? 'Unnamed practice', billed: Math.round(t.billed * 100) / 100, invoices: t.invoices }))
		.sort((a, b) => b.billed - a.billed || a.name.localeCompare(b.name))
		.slice(0, limit);
}

export type AdminTrends = {
	fillRate: FillRatePoint[];
	money: MoneyPoint[];
	shiftsByStatus: StatusPoint[];
	topPractices: PracticeRank[];
};
