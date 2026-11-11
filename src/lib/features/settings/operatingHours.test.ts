import { describe, expect, it } from 'vitest';
import {
	CLOSED_TIME,
	dayRows,
	parseOperatingHours,
	setDayOpen,
	setDayTime,
	toTimeInput
} from './operatingHours';

const stored = JSON.stringify({
	0: { openTime: CLOSED_TIME, closeTime: CLOSED_TIME, isClosed: true, timezone: 'America/New_York' },
	1: { openTime: '08:00:00-05', closeTime: '17:30:00-05', isClosed: false, timezone: 'America/New_York' },
	2: { openTime: '09:00', closeTime: '18:00', isClosed: false }
});

describe('parseOperatingHours', () => {
	it('keeps stored days and fills missing ones with the schema default', () => {
		const hours = parseOperatingHours(stored);
		expect(Object.keys(hours)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
		expect(hours['1'].timezone).toBe('America/New_York');
		expect(hours['6']).toEqual({ openTime: '00:00', closeTime: '00:00', isClosed: false });
	});

	it('survives null and invalid JSON instead of throwing', () => {
		expect(Object.keys(parseOperatingHours('null'))).toHaveLength(7);
		expect(Object.keys(parseOperatingHours('{oops'))).toHaveLength(7);
		expect(Object.keys(parseOperatingHours(undefined))).toHaveLength(7);
	});
});

describe('toTimeInput', () => {
	it('reads every stored format as HH:MM', () => {
		expect(toTimeInput('08:00:00-05')).toBe('08:00');
		expect(toTimeInput('09:15')).toBe('09:15');
		// The old grid showed "T00:0" for this one.
		expect(toTimeInput(CLOSED_TIME)).toBe('00:00');
		expect(toTimeInput(undefined)).toBe('');
		expect(toTimeInput('soon')).toBe('');
	});
});

describe('dayRows', () => {
	it('gives one row per weekday from Sunday', () => {
		const rows = dayRows(parseOperatingHours(stored));
		expect(rows.map((r) => r.short)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
		expect(rows[0]).toMatchObject({ open: false });
		expect(rows[1]).toMatchObject({ open: true, openTime: '08:00', closeTime: '17:30' });
	});
});

describe('writes keep the legacy stored format', () => {
	it('closing a day resets both times', () => {
		const hours = setDayOpen(parseOperatingHours(stored), '1', false);
		expect(hours['1']).toMatchObject({ isClosed: true, openTime: CLOSED_TIME, closeTime: CLOSED_TIME });
		expect(hours['1'].timezone).toBe('America/New_York');
	});

	it('opening a day keeps its times', () => {
		const hours = setDayOpen(parseOperatingHours(stored), '2', true);
		expect(hours['2']).toMatchObject({ isClosed: false, openTime: '09:00' });
	});

	it('a time change stores HH:MM:00-05 and leaves other days alone', () => {
		const before = parseOperatingHours(stored);
		const after = setDayTime(before, '1', 'closeTime', '16:00');
		expect(after['1'].closeTime).toBe('16:00:00-05');
		expect(after['1'].openTime).toBe('08:00:00-05');
		expect(after['2']).toEqual(before['2']);
		// Immutable: the input map is untouched.
		expect(before['1'].closeTime).toBe('17:30:00-05');
	});

	it('round-trips through JSON like the hidden form field', () => {
		const json = JSON.stringify(setDayTime(parseOperatingHours(stored), '3', 'openTime', '07:45'));
		expect(JSON.parse(json)['3'].openTime).toBe('07:45:00-05');
	});
});
