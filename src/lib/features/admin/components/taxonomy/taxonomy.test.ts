import { describe, expect, it } from 'vitest';
import { documentTypeLabel, movedOrder, pageRows, plural, shortDate, sortRows } from './taxonomy';

type Row = { name: string | null; n: number | null };
const rows: Row[] = [
	{ name: 'beta', n: 2 },
	{ name: null, n: 1 },
	{ name: 'Alpha', n: null },
	{ name: 'gamma', n: 10 }
];
const accessors = { name: (r: Row) => r.name, n: (r: Row) => r.n };

describe('sortRows', () => {
	it('returns a copy in original order without a sort', () => {
		const out = sortRows(rows, accessors, null);
		expect(out).toEqual(rows);
		expect(out).not.toBe(rows);
	});

	it('sorts text case-insensitively, nulls last in both directions', () => {
		expect(sortRows(rows, accessors, { column: 'name', direction: 'asc' }).map((r) => r.name)).toEqual([
			'Alpha',
			'beta',
			'gamma',
			null
		]);
		expect(sortRows(rows, accessors, { column: 'name', direction: 'desc' }).map((r) => r.name)).toEqual([
			'gamma',
			'beta',
			'Alpha',
			null
		]);
	});

	it('sorts numbers numerically', () => {
		expect(sortRows(rows, accessors, { column: 'n', direction: 'asc' }).map((r) => r.n)).toEqual([1, 2, 10, null]);
	});

	it('ignores an unknown column', () => {
		expect(sortRows(rows, accessors, { column: 'nope', direction: 'asc' })).toEqual(rows);
	});
});

describe('pageRows', () => {
	const many = Array.from({ length: 23 }, (_, i) => i);
	it('slices a 1-based page', () => {
		expect(pageRows(many, 2, 10)).toEqual({ rows: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], page: 2 });
	});
	it('clamps out-of-range pages', () => {
		expect(pageRows(many, 9, 10).page).toBe(3);
		expect(pageRows(many, 0, 10).page).toBe(1);
		expect(pageRows([], 4, 10)).toEqual({ rows: [], page: 1 });
	});
});

describe('movedOrder', () => {
	const ids = ['a', 'b', 'c'];
	it('swaps with the neighbour', () => {
		expect(movedOrder(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
		expect(movedOrder(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
	});
	it('leaves the ends and unknown ids alone', () => {
		expect(movedOrder(ids, 'a', -1)).toEqual(ids);
		expect(movedOrder(ids, 'c', 1)).toEqual(ids);
		expect(movedOrder(ids, 'z', 1)).toEqual(ids);
	});
});

describe('labels', () => {
	it('pluralises', () => {
		expect(plural(1, 'skill')).toBe('1 skill');
		expect(plural(0, 'entry', 'entries')).toBe('0 entries');
	});
	it('formats dates and document types', () => {
		expect(shortDate(null)).toBe('—');
		expect(shortDate('not a date')).toBe('—');
		expect(shortDate(new Date(2026, 10, 3))).toBe('Nov 3, 2026');
		expect(documentTypeLabel('CERTIFICATE')).toBe('Certificate');
	});
});
