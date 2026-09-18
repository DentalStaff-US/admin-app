/**
 * Affiliate payout scheduling.
 *
 * THE RULE (locked with the client):
 *   A commission belongs to the calendar month in which the practice's invoice
 *   was PAID. That cohort is paid out on the 1st of the month AFTER NEXT.
 *
 *     payments 1–31 Mar  ->  cohort 2026-03-01  ->  paid out 2026-05-01
 *     payments 1–30 Apr  ->  cohort 2026-04-01  ->  paid out 2026-06-01
 *
 *   So the effective hold is 30–61 days depending on where in the month the
 *   payment landed — which is what "30 days after the end of the month the
 *   payment lived in" means in practice.
 *
 * Cohort months are bucketed in AMERICA/NEW_YORK, matching both the business's
 * operating timezone and the timezone every cron rule in jobs/registry.ts uses.
 * A payment at 2026-03-31 22:00 ET is 2026-04-01 02:00 UTC — it must land in the
 * MARCH cohort, not April, so UTC bucketing would be wrong.
 *
 * Pure and dependency-free apart from date-fns-tz; `now` is always injectable.
 */
import { fromZonedTime } from 'date-fns-tz';

export const AFFILIATE_TZ = 'America/New_York';

/** Number of whole months between a cohort and its payout. 2 => Mar pays May 1. */
export const PAYOUT_DELAY_MONTHS = 2;

/** A cohort key: the first day of the month, as 'YYYY-MM-DD'. */
export type CohortMonth = string;

/** Calendar year/month of `instant` in the affiliate timezone. */
function localYearMonth(instant: Date): { year: number; month: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: AFFILIATE_TZ,
		year: 'numeric',
		month: '2-digit'
	}).formatToParts(instant);
	const year = Number(parts.find((p) => p.type === 'year')?.value);
	const month = Number(parts.find((p) => p.type === 'month')?.value);
	return { year, month };
}

function toCohortKey(year: number, month: number): CohortMonth {
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/** Add `delta` months to a 1-indexed year/month pair, carrying across years. */
function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
	const zeroBased = year * 12 + (month - 1) + delta;
	return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/**
 * Which cohort a payment belongs to. `paidAt` is the moment the invoice was
 * fully settled.
 */
export function cohortMonthFor(paidAt: Date): CohortMonth {
	const { year, month } = localYearMonth(paidAt);
	return toCohortKey(year, month);
}

export function parseCohortMonth(cohort: CohortMonth): { year: number; month: number } {
	const m = /^(\d{4})-(\d{2})-01$/.exec(cohort);
	if (!m) throw new Error(`Invalid cohort month: ${cohort} (expected YYYY-MM-01)`);
	const year = Number(m[1]);
	const month = Number(m[2]);
	if (month < 1 || month > 12) throw new Error(`Invalid cohort month: ${cohort}`);
	return { year, month };
}

/**
 * The instant a cohort becomes payable: midnight ET on the 1st, two months on.
 * Returned as a real Date so it can be compared against `now` directly.
 */
export function payoutDateForCohort(cohort: CohortMonth): Date {
	const { year, month } = parseCohortMonth(cohort);
	const due = addMonths(year, month, PAYOUT_DELAY_MONTHS);
	// Resolve midnight-on-the-1st as ET wall-clock time; fromZonedTime handles DST.
	const wallClock = `${String(due.year).padStart(4, '0')}-${String(due.month).padStart(2, '0')}-01T00:00:00`;
	return fromZonedTime(wallClock, AFFILIATE_TZ);
}

/** Whether a cohort's payout date has arrived. */
export function isCohortPayable(cohort: CohortMonth, now: Date): boolean {
	return now.getTime() >= payoutDateForCohort(cohort).getTime();
}

/**
 * The most recent cohort that is payable as of `now` — i.e. what a payout run
 * on this date should settle. Returns null before the program's first cohort
 * has matured.
 *
 * A run on 2026-05-01 (or any later date in May) settles the March cohort.
 */
export function payableCohortAsOf(now: Date): CohortMonth {
	const { year, month } = localYearMonth(now);
	const target = addMonths(year, month, -PAYOUT_DELAY_MONTHS);
	return toCohortKey(target.year, target.month);
}

/**
 * Every cohort at or before the payable one, oldest first. The payout job uses
 * this rather than only the current cohort so a missed or failed run is picked
 * up automatically on the next pass instead of stranding an affiliate's money.
 */
export function payableCohortsAsOf(now: Date, earliest: CohortMonth): CohortMonth[] {
	const latest = payableCohortAsOf(now);
	const { year: ey, month: em } = parseCohortMonth(earliest);
	const { year: ly, month: lm } = parseCohortMonth(latest);

	const start = ey * 12 + (em - 1);
	const end = ly * 12 + (lm - 1);
	if (end < start) return [];

	const out: CohortMonth[] = [];
	for (let i = start; i <= end; i++) {
		out.push(toCohortKey(Math.floor(i / 12), (i % 12) + 1));
	}
	return out;
}

/* -------------------------------------------------------------------------- */
/* Minimum payout threshold                                                   */
/* -------------------------------------------------------------------------- */

export type PayoutDecision =
	| { action: 'PAY'; amountCents: number }
	| { action: 'ROLL_FORWARD'; amountCents: number; reason: 'BELOW_MINIMUM' }
	| { action: 'SKIP'; reason: 'ZERO_BALANCE' | 'NEGATIVE_BALANCE' };

/**
 * Whether an accumulated balance should actually be transferred this run.
 *
 * Balances below the minimum roll forward rather than incurring a Stripe
 * transfer fee on a trivial amount — the affiliate still sees the pending
 * balance in the portal, and it accumulates until it clears the floor.
 *
 * A negative balance (a refund reversed more than the affiliate earned this
 * cohort) is never "paid"; it carries so it can be netted off future earnings.
 */
export function decidePayout(balanceCents: number, minimumCents: number): PayoutDecision {
	if (balanceCents < 0) return { action: 'SKIP', reason: 'NEGATIVE_BALANCE' };
	if (balanceCents === 0) return { action: 'SKIP', reason: 'ZERO_BALANCE' };
	if (balanceCents < minimumCents) {
		return { action: 'ROLL_FORWARD', amountCents: balanceCents, reason: 'BELOW_MINIMUM' };
	}
	return { action: 'PAY', amountCents: balanceCents };
}

/** Dollar string (numeric(10,2)) -> integer cents, for the configured minimum. */
export function dollarsToCents(value: string | number): number {
	const n = typeof value === 'number' ? value : parseFloat(value);
	if (!Number.isFinite(n)) throw new Error(`Invalid dollar amount: ${value}`);
	return Math.round(n * 100);
}
