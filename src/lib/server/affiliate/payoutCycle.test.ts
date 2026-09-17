import { describe, it, expect } from 'vitest';
import {
	cohortMonthFor,
	payoutDateForCohort,
	isCohortPayable,
	payableCohortAsOf,
	payableCohortsAsOf,
	parseCohortMonth,
	decidePayout,
	dollarsToCents
} from '$lib/server/affiliate/payoutCycle';

describe('cohortMonthFor', () => {
	it('buckets a mid-month payment into that month', () => {
		expect(cohortMonthFor(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-01');
	});

	it('buckets the first instant of a month correctly', () => {
		// 2026-03-01 00:00 ET is 05:00 UTC.
		expect(cohortMonthFor(new Date('2026-03-01T05:00:00Z'))).toBe('2026-03-01');
	});

	it('keeps a late-night March 31 ET payment in MARCH, not April', () => {
		// 2026-03-31 22:00 ET == 2026-04-01 02:00 UTC. UTC bucketing would say April.
		expect(cohortMonthFor(new Date('2026-04-01T02:00:00Z'))).toBe('2026-03-01');
	});

	it('puts an early-hours April 1 ET payment in APRIL', () => {
		// 2026-04-01 01:00 ET == 05:00 UTC.
		expect(cohortMonthFor(new Date('2026-04-01T05:00:00Z'))).toBe('2026-04-01');
	});

	it('handles a December payment (year boundary)', () => {
		expect(cohortMonthFor(new Date('2026-12-20T12:00:00Z'))).toBe('2026-12-01');
	});
});

describe('payoutDateForCohort', () => {
	it('pays the March cohort on May 1 — the client-stated rule', () => {
		const due = payoutDateForCohort('2026-03-01');
		// Midnight ET on May 1 (EDT, UTC-4) == 04:00 UTC.
		expect(due.toISOString()).toBe('2026-05-01T04:00:00.000Z');
	});

	it('rolls December into February of the next year', () => {
		const due = payoutDateForCohort('2026-12-01');
		// Midnight ET on Feb 1 (EST, UTC-5) == 05:00 UTC.
		expect(due.toISOString()).toBe('2027-02-01T05:00:00.000Z');
	});

	it('rolls November into January of the next year', () => {
		expect(payoutDateForCohort('2026-11-01').toISOString()).toBe('2027-01-01T05:00:00.000Z');
	});

	it('rejects a malformed cohort key rather than guessing', () => {
		expect(() => payoutDateForCohort('2026-03')).toThrow();
		expect(() => payoutDateForCohort('2026-03-15')).toThrow();
		expect(() => payoutDateForCohort('2026-13-01')).toThrow();
	});
});

describe('isCohortPayable', () => {
	it('is not payable the day before the payout date', () => {
		expect(isCohortPayable('2026-03-01', new Date('2026-04-30T12:00:00Z'))).toBe(false);
	});

	it('is payable at exactly midnight ET on the payout date', () => {
		expect(isCohortPayable('2026-03-01', new Date('2026-05-01T04:00:00Z'))).toBe(true);
	});

	it('stays payable afterwards, so a missed run can catch up', () => {
		expect(isCohortPayable('2026-03-01', new Date('2026-07-15T12:00:00Z'))).toBe(true);
	});
});

describe('payableCohortAsOf', () => {
	it('a run on May 1 settles the March cohort', () => {
		expect(payableCohortAsOf(new Date('2026-05-01T04:00:00Z'))).toBe('2026-03-01');
	});

	it('a run on Jan 1 settles the previous November', () => {
		expect(payableCohortAsOf(new Date('2027-01-01T05:00:00Z'))).toBe('2026-11-01');
	});

	it('a run on Feb 1 settles the previous December', () => {
		expect(payableCohortAsOf(new Date('2027-02-01T05:00:00Z'))).toBe('2026-12-01');
	});
});

describe('payableCohortsAsOf', () => {
	it('returns every matured cohort oldest-first so a failed run catches up', () => {
		expect(payableCohortsAsOf(new Date('2026-07-01T04:00:00Z'), '2026-03-01')).toEqual([
			'2026-03-01',
			'2026-04-01',
			'2026-05-01'
		]);
	});

	it('returns just the one cohort when only one has matured', () => {
		expect(payableCohortsAsOf(new Date('2026-05-01T04:00:00Z'), '2026-03-01')).toEqual([
			'2026-03-01'
		]);
	});

	it('returns nothing before the first cohort matures', () => {
		expect(payableCohortsAsOf(new Date('2026-04-01T04:00:00Z'), '2026-03-01')).toEqual([]);
	});

	it('spans a year boundary correctly', () => {
		expect(payableCohortsAsOf(new Date('2027-02-01T05:00:00Z'), '2026-11-01')).toEqual([
			'2026-11-01',
			'2026-12-01'
		]);
	});
});

describe('parseCohortMonth', () => {
	it('round-trips a valid key', () => {
		expect(parseCohortMonth('2026-03-01')).toEqual({ year: 2026, month: 3 });
	});
});

describe('decidePayout — the $25 floor', () => {
	const MIN = 2_500; // $25.00

	it('pays a balance at or above the minimum', () => {
		expect(decidePayout(2_500, MIN)).toEqual({ action: 'PAY', amountCents: 2_500 });
		expect(decidePayout(9_000, MIN)).toEqual({ action: 'PAY', amountCents: 9_000 });
	});

	it('rolls a sub-minimum balance forward rather than paying a transfer fee on it', () => {
		expect(decidePayout(2_499, MIN)).toEqual({
			action: 'ROLL_FORWARD',
			amountCents: 2_499,
			reason: 'BELOW_MINIMUM'
		});
	});

	it('skips a zero balance', () => {
		expect(decidePayout(0, MIN)).toEqual({ action: 'SKIP', reason: 'ZERO_BALANCE' });
	});

	it('never pays out a negative balance — it carries to net off future earnings', () => {
		expect(decidePayout(-1_000, MIN)).toEqual({ action: 'SKIP', reason: 'NEGATIVE_BALANCE' });
	});

	it('pays everything when the minimum is zero', () => {
		expect(decidePayout(1, 0)).toEqual({ action: 'PAY', amountCents: 1 });
	});
});

describe('dollarsToCents', () => {
	it('converts the configured minimum', () => {
		expect(dollarsToCents('25.00')).toBe(2_500);
		expect(dollarsToCents('0.01')).toBe(1);
		expect(dollarsToCents(25)).toBe(2_500);
	});

	it('rounds rather than truncating float noise', () => {
		expect(dollarsToCents('19.99')).toBe(1_999);
	});

	it('throws on garbage rather than silently paying 0', () => {
		expect(() => dollarsToCents('abc')).toThrow();
	});
});
