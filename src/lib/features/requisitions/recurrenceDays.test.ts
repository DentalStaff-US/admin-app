import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TIMES,
	buildRecurrenceDaysPayload,
	emptyTimes,
	getDatesInRange,
	openDates,
	payloadReady,
	shiftDurationLabel,
	skippedDates,
	unavailableReasonLabel
} from './recurrenceDays';

// Noon UTC keeps toUTCDateString stable whatever the runner's timezone.
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('getDatesInRange', () => {
	it('is inclusive of both ends', () => {
		expect(getDatesInRange(d('2026-11-09'), d('2026-11-11')).length).toBe(3);
	});
	it('returns one day when start equals end', () => {
		expect(getDatesInRange(d('2026-11-09'), d('2026-11-09')).length).toBe(1);
	});
});

describe('openDates', () => {
	const range = getDatesInRange(d('2026-11-08'), d('2026-11-14')); // Sun..Sat
	it('keeps every day when no hours are set', () => {
		expect(openDates(range, null)).toHaveLength(7);
		expect(openDates(range, {})).toHaveLength(7);
	});
	it('drops closed weekdays only', () => {
		const hours = { 0: { isClosed: true }, 6: { isClosed: true }, 1: { isClosed: false } };
		const kept = openDates(range, hours);
		expect(kept).toHaveLength(5);
		expect(kept.every((x) => x.getDay() !== 0 && x.getDay() !== 6)).toBe(true);
	});
});

describe('shiftDurationLabel', () => {
	it('formats hours and minutes', () => {
		expect(shiftDurationLabel('09:00', '17:30')).toEqual({ text: 'Shift: 8h 30m', invalid: false });
		expect(shiftDurationLabel('09:00', '17:00')).toEqual({ text: 'Shift: 8h', invalid: false });
	});
	it('flags an end before the start', () => {
		expect(shiftDurationLabel('09:00', '08:00')?.invalid).toBe(true);
	});
	it('is null until both times are valid', () => {
		expect(shiftDurationLabel('09:00', '')).toBeNull();
		expect(shiftDurationLabel('9am', '17:00')).toBeNull();
	});
});

describe('buildRecurrenceDaysPayload', () => {
	const dates = [d('2026-11-09'), d('2026-11-10')];
	it('sends one object for a single day, using the shared times', () => {
		const p = buildRecurrenceDaysPayload({
			multipleDays: false,
			sameTimeForAll: false,
			dates: [dates[0]],
			sharedTimes: DEFAULT_TIMES,
			perDayTimes: {},
			requisitionId: 42
		});
		expect(p).toEqual({ date: '2026-11-09', ...DEFAULT_TIMES, requisitionId: 42 });
	});
	it('is null until the single day has start and end', () => {
		expect(
			buildRecurrenceDaysPayload({
				multipleDays: false,
				sameTimeForAll: false,
				dates: [dates[0]],
				sharedTimes: { ...emptyTimes(), dayStartTime: '09:00' },
				perDayTimes: {},
				requisitionId: 42
			})
		).toBeNull();
	});
	it('sends an array with the shared schedule for every day', () => {
		const p = buildRecurrenceDaysPayload({
			multipleDays: true,
			sameTimeForAll: true,
			dates,
			sharedTimes: DEFAULT_TIMES,
			perDayTimes: {},
			requisitionId: 42
		});
		expect(Array.isArray(p) && p.map((e) => e.date)).toEqual(['2026-11-09', '2026-11-10']);
	});
	it('skips per-day entries left blank and lists them', () => {
		const p = buildRecurrenceDaysPayload({
			multipleDays: true,
			sameTimeForAll: false,
			dates,
			sharedTimes: emptyTimes(),
			perDayTimes: { '2026-11-09': { ...emptyTimes(), dayStartTime: '08:00', dayEndTime: '12:00' } },
			requisitionId: 42
		});
		expect(Array.isArray(p) && p).toHaveLength(1);
		expect(skippedDates(dates, p)).toEqual(['2026-11-10']);
		expect(payloadReady(p)).toBe(true);
	});
	it('defaults empty lunch to an empty string', () => {
		const p = buildRecurrenceDaysPayload({
			multipleDays: false,
			sameTimeForAll: false,
			dates: [dates[0]],
			sharedTimes: { ...emptyTimes(), dayStartTime: '08:00', dayEndTime: '12:00' },
			perDayTimes: {},
			requisitionId: 1
		});
		expect(p).toMatchObject({ lunchStartTime: '', lunchEndTime: '' });
	});
});

describe('payloadReady', () => {
	it('is false for null and for a day that ends before it starts', () => {
		expect(payloadReady(null)).toBe(false);
		expect(
			payloadReady({ date: '2026-11-09', ...emptyTimes(), dayStartTime: '17:00', dayEndTime: '09:00', requisitionId: 1 })
		).toBe(false);
	});
});

describe('unavailableReasonLabel', () => {
	it('explains each reason', () => {
		expect(unavailableReasonLabel('weekday')).toMatch(/weekday/);
		expect(unavailableReasonLabel('booked')).toMatch(/already working/);
		expect(unavailableReasonLabel('dayOff')).toMatch(/day off/);
	});
});
