// ─── MIRRORED FILE ──────────────────────────────────────────────────────────
// Twin: dtss-candidate-app/src/lib/components/availability/availability.test.ts
// Change one, change both. If one repo's copy drifts, its tests fail — which is
// the whole point of keeping this file byte-identical.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
	bookedConflicts,
	countChanges,
	expandRange,
	hasZeroDays,
	isDirty,
	isNeverSet,
	normalizeDays,
	todayInBusinessTz,
	weekdaySummary
} from './availability';

describe('normalizeDays — null means all seven', () => {
	it('expands null to every day', () => {
		// The editor must render a concrete state, and the concrete state for
		// "never set" is all seven ticked.
		expect(normalizeDays(null)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it('expands an empty array to every day too', () => {
		expect(normalizeDays([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it('sorts, dedupes and drops out-of-range values', () => {
		expect(normalizeDays([3, 1, 1, 9, -2])).toEqual([1, 3]);
	});
});

describe('isNeverSet', () => {
	it('is true only when nothing at all has been expressed', () => {
		expect(isNeverSet({ availableDays: null, blockedDates: [] })).toBe(true);
	});

	it('is false once a blackout exists, even with a null pattern', () => {
		expect(isNeverSet({ availableDays: null, blockedDates: ['2026-07-04'] })).toBe(false);
	});

	it('is false once the pattern is set, even to all seven', () => {
		expect(isNeverSet({ availableDays: [0, 1, 2, 3, 4, 5, 6], blockedDates: [] })).toBe(false);
	});
});

describe('hasZeroDays', () => {
	it('flags an explicitly empty selection', () => {
		expect(hasZeroDays([])).toBe(true);
	});

	it('does not flag null, which means all seven', () => {
		expect(hasZeroDays(null)).toBe(false);
	});
});

describe('isDirty', () => {
	const base = { availableDays: [1, 2, 3], blockedDates: ['2026-07-04'] };

	it('is false for an identical state', () => {
		expect(isDirty(base, { availableDays: [1, 2, 3], blockedDates: ['2026-07-04'] })).toBe(false);
	});

	it('ignores ordering on both fields', () => {
		expect(
			isDirty(
				{ availableDays: [1, 2, 3], blockedDates: ['2026-07-04', '2026-07-05'] },
				{ availableDays: [3, 2, 1], blockedDates: ['2026-07-05', '2026-07-04'] }
			)
		).toBe(false);
	});

	it('treats null and all-seven as equivalent for dirty purposes', () => {
		// They differ in meaning on the server, but the editor renders them
		// identically, so ticking nothing must not look like an edit.
		expect(
			isDirty({ availableDays: null, blockedDates: [] }, { availableDays: [0, 1, 2, 3, 4, 5, 6], blockedDates: [] })
		).toBe(false);
	});

	it('notices a changed weekday', () => {
		expect(isDirty(base, { availableDays: [1, 2], blockedDates: ['2026-07-04'] })).toBe(true);
	});

	it('notices an added and a removed date', () => {
		expect(isDirty(base, { availableDays: [1, 2, 3], blockedDates: [] })).toBe(true);
		expect(
			isDirty(base, { availableDays: [1, 2, 3], blockedDates: ['2026-07-04', '2026-07-05'] })
		).toBe(true);
	});
});

describe('countChanges', () => {
	it('counts weekday flips and date additions and removals', () => {
		const n = countChanges(
			{ availableDays: [0, 1, 2, 3, 4, 5, 6], blockedDates: ['2026-07-04'] },
			{ availableDays: [1, 2, 3, 4, 5], blockedDates: ['2026-07-10', '2026-07-11'] }
		);
		// Sun + Sat unticked (2), one date removed (1), two added (2).
		expect(n).toBe(5);
	});

	it('is zero for an unchanged state', () => {
		const state = { availableDays: [1, 2], blockedDates: ['2026-07-04'] };
		expect(countChanges(state, { ...state })).toBe(0);
	});
});

describe('expandRange', () => {
	it('flattens an inclusive range into individual dates', () => {
		const result = expandRange('2026-07-01', '2026-07-05', { today: '2026-01-01' });
		expect(result.added).toEqual([
			'2026-07-01',
			'2026-07-02',
			'2026-07-03',
			'2026-07-04',
			'2026-07-05'
		]);
	});

	it('handles a single-day range', () => {
		const result = expandRange('2026-07-01', '2026-07-01', { today: '2026-01-01' });
		expect(result.added).toEqual(['2026-07-01']);
	});

	it('crosses a month and a year boundary', () => {
		expect(expandRange('2026-12-30', '2027-01-02', { today: '2026-01-01' }).added).toEqual([
			'2026-12-30',
			'2026-12-31',
			'2027-01-01',
			'2027-01-02'
		]);
	});

	it('includes the leap day in 2028', () => {
		expect(expandRange('2028-02-28', '2028-03-01', { today: '2026-01-01' }).added).toEqual([
			'2028-02-28',
			'2028-02-29',
			'2028-03-01'
		]);
	});

	it('skips past days and REPORTS how many', () => {
		const result = expandRange('2026-07-01', '2026-07-05', { today: '2026-07-03' });
		expect(result.added).toEqual(['2026-07-03', '2026-07-04', '2026-07-05']);
		expect(result.skippedPast).toBe(2);
	});

	it('skips booked days and names them', () => {
		const result = expandRange('2026-07-01', '2026-07-03', {
			today: '2026-01-01',
			booked: new Set(['2026-07-02'])
		});
		expect(result.added).toEqual(['2026-07-01', '2026-07-03']);
		expect(result.skippedBooked).toEqual(['2026-07-02']);
	});

	it('returns nothing for an inverted range', () => {
		expect(expandRange('2026-07-05', '2026-07-01', { today: '2026-01-01' })).toEqual({
			added: [],
			skippedPast: 0,
			skippedBooked: []
		});
	});

	it('accepts a range years into the future — there is no horizon', () => {
		const result = expandRange('2031-06-01', '2031-06-03', { today: '2026-07-01' });
		expect(result.added).toHaveLength(3);
	});
});

describe('weekdaySummary', () => {
	it.each([
		[null, 'Available all 7 days'],
		[[0, 1, 2, 3, 4, 5, 6], 'Available all 7 days'],
		[[1, 2, 3, 4, 5], 'Mon–Fri'],
		[[1, 3, 6], 'Mon, Wed, Sat'],
		[[2], 'Tue']
	])('summarises %j as "%s"', (days, expected) => {
		expect(weekdaySummary(days as number[] | null)).toBe(expected);
	});
});

describe('bookedConflicts', () => {
	it('finds booked days that fall on an unticked weekday', () => {
		// 2026-07-04 is a Saturday.
		const conflicts = bookedConflicts([1, 2, 3, 4, 5], [{ date: '2026-07-04' }]);
		expect(conflicts.map((c) => c.date)).toEqual(['2026-07-04']);
	});

	it('finds nothing when every day is allowed', () => {
		expect(bookedConflicts(null, [{ date: '2026-07-04' }])).toEqual([]);
	});

	it('finds nothing when the booked day is still allowed', () => {
		expect(bookedConflicts([6], [{ date: '2026-07-04' }])).toEqual([]);
	});
});

describe('todayInBusinessTz', () => {
	it('returns a bare YYYY-MM-DD', () => {
		expect(todayInBusinessTz()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('uses ET, not UTC — 03:00 UTC is still the previous day in New York', () => {
		// Without the business timezone a professional could mark "today" off after
		// the ET day had already rolled over.
		expect(todayInBusinessTz(new Date('2026-07-05T03:00:00Z'))).toBe('2026-07-04');
	});

	it('has rolled over by 13:00 UTC', () => {
		expect(todayInBusinessTz(new Date('2026-07-05T13:00:00Z'))).toBe('2026-07-05');
	});
});
