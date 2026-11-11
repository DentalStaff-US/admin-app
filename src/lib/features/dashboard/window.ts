/**
 * The one KPI window for the admin dashboard (10 §3.3): this week, this month or
 * the last 30 days, in the business timezone. Every tile, the pipeline and the
 * comparison use these bounds, so no two numbers on the page mean different periods.
 */
import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { KPI_WINDOWS, type KpiWindow } from './types';

export const BUSINESS_TIMEZONE = 'America/New_York';

export const WINDOW_LABELS: Record<KpiWindow, string> = {
	week: 'this week',
	month: 'this month',
	'30d': 'last 30 days'
};

export const WINDOW_OPTIONS: { value: KpiWindow; label: string }[] = [
	{ value: 'week', label: 'This week' },
	{ value: 'month', label: 'This month' },
	{ value: '30d', label: 'Last 30 days' }
];

export const DEFAULT_KPI_WINDOW: KpiWindow = 'month';

export function parseKpiWindow(value: string | null | undefined): KpiWindow {
	return (KPI_WINDOWS as readonly string[]).includes(value ?? '')
		? (value as KpiWindow)
		: DEFAULT_KPI_WINDOW;
}

/** 'YYYY-MM-DD' of an instant in the business timezone. */
export function businessDate(instant: Date, tz = BUSINESS_TIMEZONE): string {
	return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}

/** Midnight at the start of a business-timezone date. */
export function startOfBusinessDate(date: string, tz = BUSINESS_TIMEZONE): Date {
	return fromZonedTime(`${date}T00:00:00`, tz);
}

function shiftDate(date: string, days: number): string {
	return formatInTimeZone(addDays(parseISO(`${date}T12:00:00Z`), days), 'UTC', 'yyyy-MM-dd');
}

export type WindowBounds = {
	window: KpiWindow;
	/** Start of the window. */
	start: Date;
	/** "Now": KPIs measure what has happened so far. */
	end: Date;
	/** The previous window of equal length, for the comparison. */
	prevStart: Date;
	prevEnd: Date;
	/** The full calendar period (the pipeline shows future shifts in it too). */
	periodEnd: Date;
	/** Business dates covered so far, oldest first: one sparkline point each. */
	days: string[];
};

export function kpiWindowBounds(window: KpiWindow, now: Date = new Date()): WindowBounds {
	const today = businessDate(now);
	let startDate: string;
	let periodEndDate: string;

	if (window === 'week') {
		// ISO weeks: Monday first.
		const isoDay = Number(formatInTimeZone(now, BUSINESS_TIMEZONE, 'i'));
		startDate = shiftDate(today, -(isoDay - 1));
		periodEndDate = shiftDate(startDate, 7);
	} else if (window === 'month') {
		startDate = `${today.slice(0, 7)}-01`;
		const [y, m] = startDate.split('-').map(Number);
		periodEndDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
	} else {
		startDate = shiftDate(today, -29);
		periodEndDate = shiftDate(today, 1);
	}

	const start = window === '30d' ? new Date(now.getTime() - 30 * 86_400_000) : startOfBusinessDate(startDate);
	const elapsed = now.getTime() - start.getTime();
	const prevStart =
		window === 'month'
			? startOfBusinessDate(previousMonthStart(startDate))
			: new Date(start.getTime() - (window === 'week' ? 7 : 30) * 86_400_000);

	const dayCount = differenceInCalendarDays(parseISO(today), parseISO(startDate)) + 1;
	const days = Array.from({ length: dayCount }, (_, i) => shiftDate(startDate, i));

	return {
		window,
		start,
		end: now,
		prevStart,
		// Same elapsed time, but never past the current window's start (Mar 31 vs Feb).
		prevEnd: new Date(Math.min(prevStart.getTime() + elapsed, start.getTime())),
		periodEnd: window === '30d' ? now : startOfBusinessDate(periodEndDate),
		days
	};
}

function previousMonthStart(monthStart: string): string {
	const [y, m] = monthStart.split('-').map(Number);
	return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
}

/** The next `count` business dates starting today, for the coverage board. */
export function nextBusinessDays(count: number, now: Date = new Date()): string[] {
	const today = businessDate(now);
	return Array.from({ length: count }, (_, i) => shiftDate(today, i));
}
