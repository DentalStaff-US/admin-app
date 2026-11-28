import { describe, expect, it } from 'vitest';
import { pageHrefFor, pageSummary, readPage, readSort, sortHrefFor, withParam } from './tableState';

const url = (qs: string) => new URL(`http://x/requisitions${qs}`);

describe('table URL state', () => {
	it('summarises a page', () => {
		expect(pageSummary({ page: 2, pageSize: 20, total: 134 })).toEqual({ text: 'Showing 21–40 of 134', prev: true, next: true });
		expect(pageSummary({ page: 7, pageSize: 20, total: 134 })).toEqual({ text: 'Showing 121–134 of 134', prev: true, next: false });
		expect(pageSummary({ page: 1, pageSize: 20, total: 0 })).toEqual({ text: 'No results', prev: false, next: false });
	});

	it('reads sort and page defensively', () => {
		const fallback = { column: 'created', direction: 'desc' as const };
		expect(readSort(url('?sort=rate&dir=asc'), ['rate', 'created'], fallback)).toEqual({ column: 'rate', direction: 'asc' });
		expect(readSort(url('?sort=password&dir=asc'), ['rate'], fallback)).toEqual(fallback);
		expect(readSort(url('?sort=rate&dir=sideways'), ['rate'], fallback)).toEqual({ column: 'rate', direction: 'desc' });
		expect(readPage(url('?page=3'))).toBe(3);
		expect(readPage(url('?page=-1'))).toBe(1);
		expect(readPage(url('?page=abc'))).toBe(1);
	});

	it('toggles sort direction and resets the page, keeping filters', () => {
		const current = { column: 'rate', direction: 'desc' as const };
		expect(sortHrefFor(url('?status=OPEN&page=4&sort=rate&dir=desc'), current, 'rate')).toBe('/requisitions?status=OPEN&sort=rate&dir=asc');
		expect(sortHrefFor(url('?status=OPEN'), current, 'created')).toBe('/requisitions?status=OPEN&sort=created&dir=desc');
	});

	it('builds page and filter links', () => {
		expect(pageHrefFor(url('?status=OPEN'), 2)).toBe('/requisitions?status=OPEN&page=2');
		expect(pageHrefFor(url('?status=OPEN&page=2'), 1)).toBe('/requisitions?status=OPEN');
		expect(withParam(url('?page=3&tab=open'), 'tab', 'past')).toBe('/requisitions?tab=past');
		expect(withParam(url('?tab=open'), 'tab', null)).toBe('/requisitions');
	});
});
