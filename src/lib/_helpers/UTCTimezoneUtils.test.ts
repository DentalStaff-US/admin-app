import { describe, it, expect } from 'vitest';
import {
	formatTimezoneName,
	isValidUTCTime,
	formatTimeString,
	toUTCDateString,
	formatTimeForDisplay,
	getUTCWeekStartDate,
	createUTCDateTime,
	createUTCISOString,
	calculateHours,
	calculateMaxHours
} from './UTCTimezoneUtils';

// All timezone-sensitive tests pin to dates outside DST transition windows so
// the expected offsets are stable: 2025-01-15 (winter, NY = UTC-5) and
// 2025-07-15 (summer, NY = UTC-4). Asia/Tokyo never observes DST so it's
// UTC+9 year-round.

describe('formatTimezoneName', () => {
	it.each([
		['America/New_York', 'New York'],
		['America/Los_Angeles', 'Los Angeles'],
		['Europe/London', 'London'],
		['Asia/Tokyo', 'Tokyo'],
		['UTC', 'UTC'],
		['Pacific/Honolulu', 'Honolulu']
	])('formats %s -> %s', (input, expected) => {
		expect(formatTimezoneName(input)).toBe(expected);
	});

	it('returns empty string for falsy input', () => {
		expect(formatTimezoneName('')).toBe('');
	});
});

describe('isValidUTCTime', () => {
	it.each([
		['00:00', true],
		['09:30', true],
		['12:00', true],
		['23:59', true]
	])('accepts valid time %s', (input, expected) => {
		expect(isValidUTCTime(input)).toBe(expected);
	});

	it.each([
		['', false],
		['9:30', false], // missing leading zero
		['24:00', false], // hour out of range
		['12:60', false], // minute out of range
		['ab:cd', false],
		['12:30:00', false] // HH:MM only — seconds not allowed
	])('rejects invalid time %s', (input, expected) => {
		expect(isValidUTCTime(input)).toBe(expected);
	});
});

describe('formatTimeString', () => {
	it('trims seconds off HH:MM:SS', () => {
		expect(formatTimeString('14:30:00')).toBe('14:30');
	});

	it('passes HH:MM through unchanged', () => {
		expect(formatTimeString('09:15')).toBe('09:15');
	});

	it('returns empty string for falsy input', () => {
		expect(formatTimeString('')).toBe('');
		expect(formatTimeString(null as unknown as string)).toBe('');
		expect(formatTimeString(undefined as unknown as string)).toBe('');
	});
});

describe('toUTCDateString', () => {
	it('extracts YYYY-MM-DD from a Date object', () => {
		// 2025-01-15T20:00:00Z is unambiguously 2025-01-15 in UTC.
		expect(toUTCDateString(new Date('2025-01-15T20:00:00Z'))).toBe('2025-01-15');
	});

	it('extracts YYYY-MM-DD from an ISO string', () => {
		expect(toUTCDateString('2025-07-04T12:00:00Z')).toBe('2025-07-04');
	});
});

describe('formatTimeForDisplay', () => {
	it('12-hour mode formats AM correctly', () => {
		expect(formatTimeForDisplay('09:30', true)).toBe('9:30 AM');
	});

	it('12-hour mode formats PM correctly', () => {
		expect(formatTimeForDisplay('14:30', true)).toBe('2:30 PM');
	});

	it('12-hour mode treats midnight as 12 AM', () => {
		expect(formatTimeForDisplay('00:00', true)).toBe('12:00 AM');
	});

	it('24-hour mode preserves HH:MM', () => {
		expect(formatTimeForDisplay('14:30', false)).toBe('14:30');
	});

	it('returns empty string for empty input', () => {
		expect(formatTimeForDisplay('', true)).toBe('');
	});
});

describe('getUTCWeekStartDate', () => {
	// 2025-01-15 is a Wednesday. The Sunday of that week is 2025-01-12.
	it('returns the previous Sunday for a midweek date', () => {
		expect(getUTCWeekStartDate('2025-01-15')).toBe('2025-01-12');
	});

	// 2025-01-12 IS a Sunday — should return itself.
	it('returns the same date when it is already Sunday', () => {
		expect(getUTCWeekStartDate('2025-01-12')).toBe('2025-01-12');
	});

	it('returns empty string for empty input', () => {
		expect(getUTCWeekStartDate('')).toBe('');
	});

	it('returns the input unchanged when given garbage', () => {
		// The function's documented contract: invalid input is passed through
		// (caller decides what to do). Don't throw.
		expect(getUTCWeekStartDate('not-a-date')).toBe('not-a-date');
	});
});

describe('createUTCDateTime', () => {
	it('returns a Date whose UTC representation matches NY winter offset', () => {
		// 09:00 in NY in January = 14:00 UTC.
		const d = createUTCDateTime('2025-01-15', '09:00', 'America/New_York');
		expect(d.toISOString()).toBe('2025-01-15T14:00:00.000Z');
	});

	it('applies DST correctly for NY summer', () => {
		// 09:00 in NY in July = 13:00 UTC (DST).
		const d = createUTCDateTime('2025-07-15', '09:00', 'America/New_York');
		expect(d.toISOString()).toBe('2025-07-15T13:00:00.000Z');
	});

	it('throws when any required parameter is missing', () => {
		expect(() => createUTCDateTime('', '09:00', 'America/New_York')).toThrow();
		expect(() => createUTCDateTime('2025-01-15', '', 'America/New_York')).toThrow();
		expect(() => createUTCDateTime('2025-01-15', '09:00', '')).toThrow();
	});

	it('throws on garbage date input', () => {
		expect(() => createUTCDateTime('not-a-date', '09:00', 'America/New_York')).toThrow();
	});
});

describe('createUTCISOString', () => {
	it('returns an ISO string with correct UTC offset (winter)', () => {
		const iso = createUTCISOString('2025-01-15', '09:00', 'America/New_York');
		expect(iso).toBe('2025-01-15T14:00:00.000Z');
	});

	it('applies DST correctly (summer)', () => {
		const iso = createUTCISOString('2025-07-15', '09:00', 'America/New_York');
		expect(iso).toBe('2025-07-15T13:00:00.000Z');
	});

	it('throws when any parameter is missing', () => {
		expect(() => createUTCISOString('', '09:00', 'America/New_York')).toThrow();
	});
});

describe('calculateHours', () => {
	describe('HH:MM strings', () => {
		it('returns the diff in hours for same-day times', () => {
			expect(calculateHours('09:00', '17:00')).toBe(8);
			expect(calculateHours('09:30', '17:00')).toBe(7.5);
		});

		it('rounds to two decimal places', () => {
			// 09:00 -> 09:45 = 0.75; 09:00 -> 09:20 = 0.33.
			expect(calculateHours('09:00', '09:20')).toBe(0.33);
		});

		it('handles midnight crossing — end time before start', () => {
			// 22:00 -> 06:00 next day = 8 hours.
			expect(calculateHours('22:00', '06:00')).toBe(8);
		});

		it('returns 0 for malformed input', () => {
			expect(calculateHours('', '')).toBe(0);
			expect(calculateHours('garbage', 'garbage')).toBe(0);
		});
	});

	describe('ISO timestamps', () => {
		it('returns the diff in hours between two ISO strings', () => {
			expect(
				calculateHours('2025-01-15T09:00:00Z', '2025-01-15T17:00:00Z')
			).toBe(8);
		});

		it('returns the diff between Date objects', () => {
			const start = new Date('2025-01-15T09:00:00Z');
			const end = new Date('2025-01-15T12:30:00Z');
			expect(calculateHours(start, end)).toBe(3.5);
		});

		it('handles midnight crossing for ISO timestamps', () => {
			// 22:00 -> 06:00 same-date ISO = 8h via the +24 wrap.
			expect(
				calculateHours('2025-01-15T22:00:00Z', '2025-01-15T06:00:00Z')
			).toBe(8);
		});
	});

	it('returns 0 when either input is missing', () => {
		expect(calculateHours('', '17:00')).toBe(0);
		expect(calculateHours('09:00', '')).toBe(0);
	});
});

describe('calculateMaxHours', () => {
	it('handles the new ISO format (dayStart/dayEnd)', () => {
		expect(
			calculateMaxHours({
				dayStart: '2025-01-15T09:00:00Z',
				dayEnd: '2025-01-15T17:00:00Z'
			})
		).toBe(8);
	});

	it('handles the legacy format (dayStartTime/dayEndTime)', () => {
		expect(
			calculateMaxHours({
				dayStartTime: '09:00',
				dayEndTime: '17:30'
			})
		).toBe(8.5);
	});

	it('returns 0 when the recurrence day is missing required fields', () => {
		expect(calculateMaxHours(null)).toBe(0);
		expect(calculateMaxHours(undefined)).toBe(0);
		expect(calculateMaxHours({})).toBe(0);
		expect(calculateMaxHours({ dayStart: '2025-01-15T09:00:00Z' })).toBe(0);
	});

	it('rounds to two decimal places', () => {
		expect(
			calculateMaxHours({ dayStartTime: '09:00', dayEndTime: '09:20' })
		).toBe(0.33);
	});
});
