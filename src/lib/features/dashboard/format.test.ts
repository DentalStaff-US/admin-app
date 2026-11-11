import { describe, expect, it } from 'vitest';
import { failed, ok } from './types';
import { formatAge, formatDuration, formatMetric, formatMoneyTile, percentChange, shortName } from './format';

describe('formatMoneyTile', () => {
	it('uses whole dollars below $10k and compacts above', () => {
		expect(formatMoneyTile(9820.4)).toBe('$9,820');
		expect(formatMoneyTile(48_210)).toBe('$48.2k');
		expect(formatMoneyTile(12_000)).toBe('$12k');
		expect(formatMoneyTile(1_250_000)).toBe('$1.3M');
		expect(formatMoneyTile(0)).toBe('$0');
	});
});

describe('formatMetric', () => {
	it('renders a failed load as a dash, never 0', () => {
		expect(formatMetric(failed<number>(), String)).toBe('—');
		expect(formatMetric(ok(0), String)).toBe('0');
	});
});

describe('formatDuration', () => {
	it('reads naturally at each scale', () => {
		expect(formatDuration(42)).toBe('42m');
		expect(formatDuration(190)).toBe('3h 10m');
		expect(formatDuration(120)).toBe('2h');
		expect(formatDuration(60 * 52)).toBe('2d 4h');
	});
});

describe('formatAge', () => {
	const now = new Date('2026-11-10T12:00:00Z');
	it('rounds down to the largest unit', () => {
		expect(formatAge(new Date('2026-11-10T11:30:00Z'), now)).toBe('<1h');
		expect(formatAge(new Date('2026-11-10T07:00:00Z'), now)).toBe('5h');
		expect(formatAge(new Date('2026-11-07T11:00:00Z'), now)).toBe('3d');
		expect(formatAge(new Date('2026-09-29T12:00:00Z'), now)).toBe('6w');
	});
});

describe('percentChange', () => {
	it('is null without a base', () => {
		expect(percentChange(5, 0)).toBeNull();
		expect(percentChange(null, 3)).toBeNull();
		expect(percentChange(110, 100)).toBe(10);
		expect(percentChange(90, 100)).toBe(-10);
	});
});

describe('shortName', () => {
	it('abbreviates the first name', () => {
		expect(shortName('Maria', 'Chen')).toBe('M. Chen');
		expect(shortName(null, null)).toBe('Unknown');
	});
});
