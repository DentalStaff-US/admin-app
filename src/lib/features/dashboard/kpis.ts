/**
 * Pure KPI arithmetic (10 §3.3): fill rate, median time to fill, daily series,
 * and receivables ageing. The server reads rows; everything here is testable.
 */
import { AGEING_BUCKETS, type AgeingBucket, type Receivables, type Series } from './types';
import { businessDate } from './window';

// --- Fill rate -----------------------------------------------------------

export type FillRow = { status: string; dayStart: Date };

/** filled ÷ (filled + unfulfilled); null when no shift has resolved yet. */
export function fillRate(rows: FillRow[]): number | null {
	let filled = 0;
	let unfulfilled = 0;
	for (const r of rows) {
		if (r.status === 'FILLED') filled++;
		else if (r.status === 'UNFULFILLED') unfulfilled++;
	}
	const total = filled + unfulfilled;
	return total === 0 ? null : filled / total;
}

export function inRange(at: Date, start: Date, end: Date): boolean {
	const t = new Date(at).getTime();
	return t >= start.getTime() && t < end.getTime();
}

/** One value per business day, computed from the rows that fall on that day. */
export function dailySeries<T>(
	rows: T[],
	days: string[],
	at: (row: T) => Date,
	reduce: (rows: T[]) => number | null
): Series {
	const byDay = new Map<string, T[]>();
	for (const row of rows) {
		const day = businessDate(new Date(at(row)));
		const list = byDay.get(day) ?? [];
		list.push(row);
		byDay.set(day, list);
	}
	return days.map((d) => {
		const list = byDay.get(d);
		return list && list.length ? reduce(list) : null;
	});
}

// --- Time to fill --------------------------------------------------------

export type FillEventRow = {
	/** recurrence_days.created_at: when the shift was posted. */
	postedAt: Date;
	/** The first CLAIM/ASSIGN for that shift in action_history. */
	filledAt: Date;
	/** Assigned in the transaction that created it: pre-arranged, not a response time (10 §5b). */
	preArranged: boolean;
};

export function minutesToFill(row: FillEventRow): number {
	return Math.max(0, (new Date(row.filledAt).getTime() - new Date(row.postedAt).getTime()) / 60_000);
}

export function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function medianTimeToFill(rows: FillEventRow[]): number | null {
	return median(rows.filter((r) => !r.preArranged).map(minutesToFill));
}

// --- Sums ----------------------------------------------------------------

export function sum(values: number[]): number {
	return values.reduce((n, v) => n + v, 0);
}

// --- Receivables ageing (10 §3.4) -----------------------------------------

export type OpenInvoiceRow = { amountRemaining: number; dueDate: Date | null };

export function ageingBucket(dueDate: Date | null, now: Date = new Date()): AgeingBucket {
	if (!dueDate) return 'current';
	const days = Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000);
	if (days < 1) return 'current';
	if (days <= 30) return '1-30';
	if (days <= 60) return '31-60';
	return '60+';
}

export function emptyReceivables(): Receivables {
	return Object.fromEntries(AGEING_BUCKETS.map((b) => [b, { count: 0, amount: 0 }])) as Receivables;
}

export function bucketReceivables(rows: OpenInvoiceRow[], now: Date = new Date()): Receivables {
	const out = emptyReceivables();
	for (const row of rows) {
		const bucket = out[ageingBucket(row.dueDate, now)];
		bucket.count += 1;
		bucket.amount += Number(row.amountRemaining) || 0;
	}
	return out;
}

export const AGEING_LABELS: Record<AgeingBucket, string> = {
	current: 'Current',
	'1-30': '1–30 days',
	'31-60': '31–60 days',
	'60+': '60+ days'
};

export const AGEING_HINTS: Record<AgeingBucket, string> = {
	current: 'Open invoices not yet past their due date.',
	'1-30': 'Invoices 1 to 30 days past their due date.',
	'31-60': 'Invoices 31 to 60 days past their due date.',
	'60+': 'Invoices more than 60 days past their due date.'
};
