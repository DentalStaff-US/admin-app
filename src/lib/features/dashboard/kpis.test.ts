import { describe, expect, it } from 'vitest';
import { ageingBucket, bucketReceivables, dailySeries, fillRate, median, medianTimeToFill } from './kpis';

describe('fillRate', () => {
	it('is filled ÷ (filled + unfulfilled), ignoring other statuses', () => {
		const d = new Date();
		expect(fillRate([{ status: 'FILLED', dayStart: d }, { status: 'FILLED', dayStart: d }, { status: 'UNFULFILLED', dayStart: d }, { status: 'OPEN', dayStart: d }])).toBeCloseTo(2 / 3);
		expect(fillRate([{ status: 'OPEN', dayStart: d }])).toBeNull();
	});
});

describe('median time to fill', () => {
	const posted = new Date('2026-11-01T12:00:00Z');
	const at = (minutes: number, preArranged = false) => ({
		postedAt: posted,
		filledAt: new Date(posted.getTime() + minutes * 60_000),
		preArranged
	});

	it('takes the median', () => {
		expect(median([5, 1, 3])).toBe(3);
		expect(median([1, 2, 3, 4])).toBe(2.5);
		expect(median([])).toBeNull();
	});

	it('excludes pre-arranged assignments (10 §5b)', () => {
		expect(medianTimeToFill([at(0, true), at(0, true), at(60), at(120)])).toBe(90);
	});
});

describe('dailySeries', () => {
	it('gives one value per business day, null where nothing happened', () => {
		const rows = [
			{ at: new Date('2026-11-01T15:00:00Z'), v: 2 },
			{ at: new Date('2026-11-01T18:00:00Z'), v: 3 },
			// 11pm ET on Nov 2 is Nov 3 UTC: it belongs to Nov 2.
			{ at: new Date('2026-11-03T04:00:00Z'), v: 7 }
		];
		const series = dailySeries(rows, ['2026-11-01', '2026-11-02', '2026-11-03'], (r) => r.at, (list) => list.reduce((n, r) => n + r.v, 0));
		expect(series).toEqual([5, 7, null]);
	});
});

describe('receivables ageing', () => {
	const now = new Date('2026-11-10T12:00:00Z');
	const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

	it('buckets by days past due', () => {
		expect(ageingBucket(null, now)).toBe('current');
		expect(ageingBucket(daysAgo(-3), now)).toBe('current');
		expect(ageingBucket(daysAgo(1), now)).toBe('1-30');
		expect(ageingBucket(daysAgo(30), now)).toBe('1-30');
		expect(ageingBucket(daysAgo(31), now)).toBe('31-60');
		expect(ageingBucket(daysAgo(61), now)).toBe('60+');
	});

	it('sums amounts and counts', () => {
		const r = bucketReceivables(
			[
				{ amountRemaining: 100, dueDate: daysAgo(-5) },
				{ amountRemaining: 50.5, dueDate: daysAgo(10) },
				{ amountRemaining: 20, dueDate: daysAgo(12) },
				{ amountRemaining: 900, dueDate: daysAgo(90) }
			],
			now
		);
		expect(r.current).toEqual({ count: 1, amount: 100 });
		expect(r['1-30']).toEqual({ count: 2, amount: 70.5 });
		expect(r['31-60']).toEqual({ count: 0, amount: 0 });
		expect(r['60+']).toEqual({ count: 1, amount: 900 });
	});
});
