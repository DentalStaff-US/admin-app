import { describe, it, expect } from 'vitest';
import {
	blockedDatesWithin,
	checkAvailability,
	dayOfWeekFromDateString,
	hasCustomWeeklyPattern,
	normalizeAvailableDays,
	selectNotifiableCandidates,
	type CandidateAvailabilityPattern
} from './availability';

// Timezone-sensitive cases pin to dates outside DST transition windows so the
// expected answers are stable: 2025-01-15 (winter, NY = UTC-5) and 2025-07-15
// (summer, NY = UTC-4). The DST transition days themselves get their own cases.

function pattern(overrides: Partial<CandidateAvailabilityPattern> = {}): CandidateAvailabilityPattern {
	return {
		availableDays: null,
		blackoutDates: new Set<string>(),
		bookedDates: new Set<string>(),
		...overrides
	};
}

describe('default-available semantics', () => {
	// Mon 2025-01-13 .. Sun 2025-01-19 — one of each weekday.
	const week = [
		'2025-01-13',
		'2025-01-14',
		'2025-01-15',
		'2025-01-16',
		'2025-01-17',
		'2025-01-18',
		'2025-01-19'
	];

	it('a NULL pattern is available on all seven days', () => {
		const p = pattern({ availableDays: null });
		for (const date of week) {
			expect(checkAvailability(p, date)).toEqual({ available: true });
		}
	});

	it('an EMPTY pattern is ALSO available on all seven days', () => {
		// Defensive twin of the candidate_profiles_available_days_check constraint.
		// If this ever fails, one bad row hides every shift from that professional
		// with no visible cause and no error anywhere.
		const p = pattern({ availableDays: [] });
		for (const date of week) {
			expect(checkAvailability(p, date)).toEqual({ available: true });
		}
	});

	it('a full seven-day pattern blocks nothing', () => {
		const p = pattern({ availableDays: [0, 1, 2, 3, 4, 5, 6] });
		for (const date of week) {
			expect(checkAvailability(p, date)).toEqual({ available: true });
		}
	});

	it.each([
		[null, false],
		[[], false],
		[[0, 1, 2, 3, 4, 5, 6], false],
		[[1], true],
		[[1, 2, 3, 4, 5], true]
	])('hasCustomWeeklyPattern(%j) === %s', (days, expected) => {
		expect(hasCustomWeeklyPattern(days as number[] | null)).toBe(expected);
	});
});

describe('day of week — Sunday is 0', () => {
	it.each([
		// Pins DOW (0=Sun) against ISODOW (1=Mon..7=Sun). Swapping them makes Sunday
		// 7, which no stored value ever matches, so Sundays silently vanish for every
		// professional with a pattern — and only Sundays, so it survives casual testing.
		['2025-01-19', 0], // Sunday, winter
		['2025-01-13', 1],
		['2025-01-14', 2],
		['2025-01-15', 3],
		['2025-01-16', 4],
		['2025-01-17', 5],
		['2025-01-18', 6], // Saturday, winter
		['2025-07-13', 0], // Sunday, summer
		['2025-07-19', 6] // Saturday, summer
	])('dayOfWeekFromDateString(%s) === %i', (date, expected) => {
		expect(dayOfWeekFromDateString(date)).toBe(expected);
	});

	it('a pattern of [0] permits Sunday and blocks Monday', () => {
		const p = pattern({ availableDays: [0] });
		expect(checkAvailability(p, '2025-01-19')).toEqual({ available: true });
		const monday = checkAvailability(p, '2025-01-13');
		expect(monday.available).toBe(false);
		expect(monday).toMatchObject({ reason: 'weekday' });
	});

	it('names the weekday in the block message', () => {
		const p = pattern({ availableDays: [1, 2, 3, 4, 5] });
		const result = checkAvailability(p, '2025-01-18');
		expect(result.available).toBe(false);
		if (!result.available) expect(result.message).toContain('Saturdays');
	});
});

describe('DST-safe date handling', () => {
	it.each([
		['2025-03-09', 0], // spring forward, a Sunday
		['2025-11-02', 0] // fall back, a Sunday
	])('resolves the DST transition day %s to %i', (date, expected) => {
		expect(dayOfWeekFromDateString(date)).toBe(expected);
	});

	it('agrees with local-midnight parsing, not UTC-midnight parsing', () => {
		// The regression guard for `new Date('2026-07-04').getDay()`, which parses a
		// date-only string as UTC midnight and then reports it in local time — so it
		// is off by one everywhere west of UTC, i.e. all of the US.
		//
		// Mutating process.env.TZ mid-run does not reliably re-seed Node's timezone
		// cache, so instead we assert the property that actually matters: the answer
		// must equal the weekday of that calendar date constructed LOCALLY, which is
		// correct in every timezone by definition.
		for (const [y, m, d] of [
			[2026, 7, 4], // Saturday
			[2025, 1, 19], // Sunday
			[2025, 3, 9], // spring forward
			[2025, 11, 2] // fall back
		]) {
			const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			expect(dayOfWeekFromDateString(iso)).toBe(new Date(y, m - 1, d).getDay());
		}
	});

	it('differs from naive UTC parsing when the runtime is west of UTC', () => {
		// Documents the bug this guards against rather than asserting it: when the
		// process runs west of UTC the naive form disagrees, and that disagreement is
		// precisely what would shift every professional's weekday by one.
		const naive = new Date('2026-07-04').getDay();
		const correct = dayOfWeekFromDateString('2026-07-04');
		const offsetMinutes = new Date(2026, 6, 4).getTimezoneOffset();
		if (offsetMinutes > 0) {
			// West of UTC (getTimezoneOffset is positive there).
			expect(naive).not.toBe(correct);
		} else {
			expect(naive).toBe(correct);
		}
		expect(correct).toBe(new Date(2026, 6, 4).getDay());
	});
});

describe('blackout dates compare as bare date strings', () => {
	it('blocks a date present in the blackout set', () => {
		const p = pattern({ blackoutDates: new Set(['2026-07-04']) });
		const result = checkAvailability(p, '2026-07-04');
		expect(result.available).toBe(false);
		expect(result).toMatchObject({ reason: 'blackout' });
	});

	it('leaves the neighbouring date alone', () => {
		const p = pattern({ blackoutDates: new Set(['2026-07-04']) });
		expect(checkAvailability(p, '2026-07-05')).toEqual({ available: true });
	});

	it('does not match a loosely formatted date', () => {
		// No loose parsing anywhere in this feature: the DB column is a bare date and
		// every comparison is string equality on 'YYYY-MM-DD'.
		const p = pattern({ blackoutDates: new Set(['2026-07-04']) });
		expect(checkAvailability(p, '2026-7-4')).toEqual({ available: true });
	});
});

describe('reason precedence — blackout > weekday > booked', () => {
	it('reports blackout when the date is both blacked out and off-pattern', () => {
		const p = pattern({
			availableDays: [1, 2, 3],
			blackoutDates: new Set(['2025-01-18'])
		});
		expect(checkAvailability(p, '2025-01-18')).toMatchObject({ reason: 'blackout' });
	});

	it('reports weekday when the date is both booked and off-pattern', () => {
		const p = pattern({
			availableDays: [1, 2, 3],
			bookedDates: new Set(['2025-01-18'])
		});
		expect(checkAvailability(p, '2025-01-18')).toMatchObject({ reason: 'weekday' });
	});

	it('reports booked when only the booking applies', () => {
		const p = pattern({ bookedDates: new Set(['2025-01-15']) });
		expect(checkAvailability(p, '2025-01-15')).toMatchObject({ reason: 'booked' });
	});

	it('considerBooked:false ignores bookedDates entirely', () => {
		const p = pattern({ bookedDates: new Set(['2025-01-15']) });
		expect(checkAvailability(p, '2025-01-15', { considerBooked: false })).toEqual({
			available: true
		});
	});
});

describe('blockedDatesWithin', () => {
	it('returns only the blocked dates, with reasons', () => {
		const p = pattern({
			availableDays: [1, 2, 3, 4, 5],
			blackoutDates: new Set(['2025-01-15'])
		});
		const blocked = blockedDatesWithin(p, ['2025-01-13', '2025-01-15', '2025-01-18']);
		expect(blocked.map((b) => [b.date, b.reason])).toEqual([
			['2025-01-15', 'blackout'],
			['2025-01-18', 'weekday']
		]);
	});

	it('returns [] for a professional who has set nothing', () => {
		expect(blockedDatesWithin(pattern(), ['2025-01-13', '2025-01-18'])).toEqual([]);
	});
});

describe('normalizeAvailableDays', () => {
	it('sorts and dedupes', () => {
		expect(normalizeAvailableDays([3, 1, 1, 0])).toEqual({ ok: true, days: [0, 1, 3] });
	});

	it('rejects an empty array rather than silently saving it', () => {
		expect(normalizeAvailableDays([])).toEqual({ ok: false, reason: 'EMPTY' });
	});

	it('passes null through as an explicit reset to default-available', () => {
		expect(normalizeAvailableDays(null)).toEqual({ ok: true, days: null });
		expect(normalizeAvailableDays(undefined)).toEqual({ ok: true, days: null });
	});

	it.each([[[7]], [[-1]], [['1']], [[1.5]], ['nope'], [{}]])(
		'rejects %j as INVALID',
		(input) => {
			expect(normalizeAvailableDays(input)).toEqual({ ok: false, reason: 'INVALID' });
		}
	);
});

describe('selectNotifiableCandidates', () => {
	const days = [{ date: '2025-01-13' }, { date: '2025-01-18' }];

	it('drops a candidate blocked on all of the new days', () => {
		const result = selectNotifiableCandidates(
			[{ candidateId: 'c1' }],
			days,
			new Map([
				[
					'c1',
					[
						{ date: '2025-01-13', reason: 'weekday' as const },
						{ date: '2025-01-18', reason: 'weekday' as const }
					]
				]
			])
		);
		expect(result).toEqual([]);
	});

	it('keeps a candidate blocked on some days, with ONLY their available days', () => {
		// Per-candidate, not per-blast: someone available Mon-Wed must still hear
		// about a Mon-Fri posting.
		const result = selectNotifiableCandidates(
			[{ candidateId: 'c1' }],
			days,
			new Map([['c1', [{ date: '2025-01-18', reason: 'weekday' as const }]]])
		);
		expect(result).toHaveLength(1);
		expect(result[0].days).toEqual([{ date: '2025-01-13' }]);
	});

	it('gives each kept candidate its OWN days array', () => {
		// notifyQualifiedCandidatesOfNewWorkdays builds the message body once.
		// Trimming the filter but sharing the array is how a text ends up naming a
		// Saturday the recipient does not work — the exact bug this feature prevents.
		const result = selectNotifiableCandidates(
			[{ candidateId: 'c1' }, { candidateId: 'c2' }],
			days,
			new Map()
		);
		expect(result).toHaveLength(2);
		expect(result[0].days).not.toBe(result[1].days);
		expect(result[0].days).not.toBe(days);
	});

	it('keeps a candidate with no unavailability entry at all, with every day', () => {
		const result = selectNotifiableCandidates([{ candidateId: 'c1' }], days, new Map());
		expect(result[0].days).toEqual(days);
	});
});
