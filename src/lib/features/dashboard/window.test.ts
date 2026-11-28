import { describe, expect, it } from 'vitest';
import { kpiWindowBounds, nextBusinessDays, parseKpiWindow } from './window';

// Tue Nov 10 2026, 10:00 ET
const NOW = new Date('2026-11-10T15:00:00Z');

describe('parseKpiWindow', () => {
	it('defaults to this month', () => {
		expect(parseKpiWindow(null)).toBe('month');
		expect(parseKpiWindow('year')).toBe('month');
		expect(parseKpiWindow('week')).toBe('week');
	});
});

describe('kpiWindowBounds', () => {
	it('this month runs from the 1st (ET) to now, against the same span last month', () => {
		const b = kpiWindowBounds('month', NOW);
		expect(b.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
		expect(b.end).toEqual(NOW);
		expect(b.prevStart.toISOString()).toBe('2026-10-01T04:00:00.000Z');
		expect(b.prevEnd.getTime() - b.prevStart.getTime()).toBe(NOW.getTime() - b.start.getTime());
		expect(b.periodEnd.toISOString()).toBe('2026-12-01T05:00:00.000Z');
		expect(b.days).toHaveLength(10);
		expect(b.days[0]).toBe('2026-11-01');
		expect(b.days.at(-1)).toBe('2026-11-10');
	});

	it('this week starts on Monday', () => {
		const b = kpiWindowBounds('week', NOW);
		expect(b.days).toEqual(['2026-11-09', '2026-11-10']);
		expect(b.prevStart.getTime()).toBe(b.start.getTime() - 7 * 86_400_000);
	});

	it('last 30 days compares with the 30 before', () => {
		const b = kpiWindowBounds('30d', NOW);
		expect(b.end.getTime() - b.start.getTime()).toBe(30 * 86_400_000);
		expect(b.prevEnd).toEqual(b.start);
		expect(b.days).toHaveLength(30);
	});

	it('never lets the previous window run into the current one (Mar 31 vs Feb)', () => {
		const b = kpiWindowBounds('month', new Date('2026-03-31T20:00:00Z'));
		expect(b.prevEnd.getTime()).toBeLessThanOrEqual(b.start.getTime());
	});
});

describe('nextBusinessDays', () => {
	it('starts today in ET', () => {
		expect(nextBusinessDays(3, new Date('2026-11-11T03:00:00Z'))).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
	});
});
