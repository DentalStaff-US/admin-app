import { describe, expect, it } from 'vitest';
import { fillRateByWeek, moneyByWeek, shiftsByStatusWeek, topPractices, weekKey, weeksAround } from './trends';

// Wed Nov 11 2026, 10:00 ET
const now = new Date('2026-11-11T15:00:00Z');

describe('weeks', () => {
	it('keys a date by its ET Monday, including late Sunday night ET', () => {
		expect(weekKey(now)).toBe('2026-11-09');
		// Sun Nov 15 23:30 ET is Mon 04:30 UTC: still the week of Nov 9.
		expect(weekKey('2026-11-16T04:30:00Z')).toBe('2026-11-09');
		expect(weekKey('2026-11-16T05:30:00Z')).toBe('2026-11-16');
	});

	it('lists weeks oldest first, ending this week plus any ahead', () => {
		const weeks = weeksAround(now, 3, 1);
		expect(weeks.map((w) => w.key)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
		expect(weeks[2].label).toBe('Nov 9');
	});
});

describe('fillRateByWeek', () => {
	it('counts only filled and unfulfilled, and leaves empty weeks null', () => {
		const weeks = weeksAround(now, 2);
		const rows = fillRateByWeek(
			[
				{ status: 'FILLED', dayStart: '2026-11-10T13:00:00Z' },
				{ status: 'FILLED', dayStart: '2026-11-11T13:00:00Z' },
				{ status: 'UNFULFILLED', dayStart: '2026-11-12T13:00:00Z' },
				{ status: 'OPEN', dayStart: '2026-11-12T13:00:00Z' },
				{ status: 'FILLED', dayStart: '2025-01-01T13:00:00Z' }
			],
			weeks
		);
		expect(rows[0]).toMatchObject({ rate: null, total: 0 });
		expect(rows[1]).toMatchObject({ filled: 2, total: 3 });
		expect(rows[1].rate).toBeCloseTo(2 / 3);
	});
});

describe('moneyByWeek', () => {
	it('sums invoices into their week and reads margin in cents', () => {
		const weeks = weeksAround(now, 2);
		const rows = moneyByWeek(
			[
				{ total: 100.1, createdAt: '2026-11-03T15:00:00Z' },
				{ total: 50, createdAt: '2026-11-10T15:00:00Z' },
				{ total: 25.25, createdAt: '2026-11-11T15:00:00Z' }
			],
			new Map([['2026-11-09', 1234]]),
			weeks
		);
		expect(rows).toEqual([
			{ week: '2026-11-02', label: 'Nov 2', billed: 100.1, margin: 0 },
			{ week: '2026-11-09', label: 'Nov 9', billed: 75.25, margin: 12.34 }
		]);
	});
});

describe('shiftsByStatusWeek', () => {
	it('splits counts by status and marks future weeks', () => {
		const rows = shiftsByStatusWeek(
			[
				{ status: 'FILLED', dayStart: '2026-11-10T13:00:00Z' },
				{ status: 'CANCELED', dayStart: '2026-11-10T13:00:00Z' },
				{ status: 'OPEN', dayStart: '2026-11-17T13:00:00Z' },
				{ status: 'WEIRD', dayStart: '2026-11-17T13:00:00Z' }
			],
			weeksAround(now, 1, 1),
			now
		);
		expect(rows[0]).toMatchObject({ future: false, FILLED: 1, CANCELED: 1, OPEN: 0 });
		expect(rows[1]).toMatchObject({ future: true, OPEN: 1, FILLED: 0 });
	});
});

describe('topPractices', () => {
	it('ranks practices by billed and caps the list', () => {
		const ranked = topPractices(
			[
				{ clientId: 'a', total: 100 },
				{ clientId: 'b', total: 300 },
				{ clientId: 'a', total: 250 },
				{ clientId: 'c', total: 0 }
			],
			new Map([['a', 'Alpha Dental'], ['b', 'Bright Smiles']]),
			2
		);
		expect(ranked).toEqual([
			{ clientId: 'a', name: 'Alpha Dental', billed: 350, invoices: 2 },
			{ clientId: 'b', name: 'Bright Smiles', billed: 300, invoices: 1 }
		]);
	});
});
