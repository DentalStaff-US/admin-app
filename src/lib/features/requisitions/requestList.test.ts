import { describe, expect, it } from 'vitest';
import {
	buildList,
	facets,
	fillProgress,
	inDateRange,
	isFilled,
	isPast,
	parseTab,
	readFilters,
	sortRows,
	tabOf,
	type ListRow
} from './requestList';

const now = new Date('2026-11-10T15:00:00Z');
const day = (date: string, status = 'OPEN') => ({
	dayStart: `${date}T13:00:00Z`,
	dayEnd: `${date}T21:00:00Z`,
	status
});
const row = (over: Partial<ListRow>): ListRow => ({
	id: 1,
	title: 'Hygienist',
	status: 'OPEN',
	createdAt: '2026-11-01T12:00:00Z',
	hourlyRate: 48,
	permanentPosition: false,
	referenceTimezone: 'America/New_York',
	locationId: 'loc-1',
	locationName: 'Tampa',
	companyId: 'co-1',
	companyName: 'Bright Smiles',
	disciplineName: 'Dental Hygienist',
	days: [],
	...over
});

describe('fillProgress', () => {
	it('counts filled days over days that were not canceled', () => {
		const r = row({ days: [day('2026-11-12', 'FILLED'), day('2026-11-13'), day('2026-11-14', 'CANCELED')] });
		expect(fillProgress(r)).toEqual({ filled: 1, total: 2, percent: 50 });
		expect(fillProgress(row({}))).toEqual({ filled: 0, total: 0, percent: 0 });
	});
});

describe('tabs', () => {
	it('is past once the request ended or its last day finished', () => {
		expect(isPast(row({ status: 'CLOSED' }), now)).toBe(true);
		expect(isPast(row({ status: 'PAYMENT_RECEIVED', permanentPosition: true }), now)).toBe(true);
		expect(isPast(row({ days: [day('2026-11-02', 'FILLED')] }), now)).toBe(true);
		expect(isPast(row({ days: [day('2026-11-02'), day('2026-11-20')] }), now)).toBe(false);
		expect(isPast(row({ permanentPosition: true }), now)).toBe(false);
	});
	it('is filled when every upcoming day is filled, or a permanent hire was made', () => {
		expect(isFilled(row({ days: [day('2026-11-02'), day('2026-11-12', 'FILLED')] }), now)).toBe(true);
		expect(isFilled(row({ days: [day('2026-11-12', 'FILLED'), day('2026-11-13')] }), now)).toBe(false);
		expect(isFilled(row({ days: [] }), now)).toBe(false);
		expect(isFilled(row({ permanentPosition: true, status: 'PAYMENT_REQUIRED' }), now)).toBe(true);
	});
	it('puts a pending request with no days under Open', () => {
		expect(tabOf(row({ status: 'PENDING' }), now)).toBe('open');
	});
	it('falls back to Open for an unknown tab', () => {
		expect(parseTab('payment-required')).toBe('open');
		expect(parseTab('permanent')).toBe('permanent');
	});
});

describe('filters', () => {
	it('reads repeated and comma-separated values and ignores bad dates', () => {
		const url = new URL('http://x/requisitions?location=a,b&location=c&type=temp&type=bogus&from=2026-11-01&to=nope');
		expect(readFilters(url)).toMatchObject({ location: ['a', 'b', 'c'], type: ['temp'], from: '2026-11-01', to: null });
	});
	it('matches temp requests by any day overlapping the range, permanent by posting date', () => {
		const temp = row({ days: [day('2026-11-12'), day('2026-11-20')] });
		expect(inDateRange(temp, '2026-11-15', '2026-11-25')).toBe(true);
		expect(inDateRange(temp, '2026-11-21', null)).toBe(false);
		const perm = row({ permanentPosition: true });
		expect(inDateRange(perm, '2026-11-01', '2026-11-01')).toBe(true);
		expect(inDateRange(perm, '2026-11-02', null)).toBe(false);
	});
});

describe('buildList', () => {
	const rows = [
		row({ id: 1, days: [day('2026-11-12')] }),
		row({ id: 2, days: [day('2026-11-12', 'FILLED')], locationId: 'loc-2', locationName: 'Brandon' }),
		row({ id: 3, status: 'CLOSED' }),
		row({ id: 4, permanentPosition: true, applicantCount: 3 })
	];
	const base = {
		tab: 'open' as const,
		filters: readFilters(new URL('http://x/')),
		sort: { column: 'created', direction: 'desc' as const },
		page: 1,
		pageSize: 2,
		now
	};
	it('counts every tab under the active filters and pages the current one', () => {
		const out = buildList(rows, base);
		expect(out.counts).toEqual({ open: 2, filled: 1, past: 1, permanent: 1, all: 4 });
		expect(out.total).toBe(2);
		expect(out.rows.map((r) => r.id)).toEqual([4, 1]);
	});
	it('applies filters before counting', () => {
		const out = buildList(rows, { ...base, tab: 'all', filters: { ...base.filters, location: ['loc-2'] } });
		expect(out.counts.all).toBe(1);
		expect(out.rows[0].id).toBe(2);
	});
	it('clamps an out-of-range page', () => {
		expect(buildList(rows, { ...base, tab: 'all', page: 9 }).page).toBe(2);
	});
	it('sorts by fill using applicant counts for permanent rows', () => {
		const sorted = sortRows([rows[0], rows[1], rows[3]], { column: 'fill', direction: 'desc' });
		expect(sorted.map((r) => r.id)).toEqual([2, 4, 1]);
	});
	it('builds facets with counts', () => {
		expect(facets(rows).location).toEqual([
			{ value: 'loc-2', label: 'Brandon', count: 1 },
			{ value: 'loc-1', label: 'Tampa', count: 3 }
		]);
	});
});
