/**
 * Types and URL helpers for DataTable (design doc 03 › DataTable). Lists are
 * server-driven: sort, page and filters live in the query string so a view
 * can be shared, and the table renders links rather than holding state.
 */
import type { Snippet } from 'svelte';

export type DataColumn<T> = {
	id: string;
	header: string;
	/** Plain text value; use `cell` for markup. */
	value?: (row: T) => string | number | null | undefined;
	cell?: Snippet<[T]>;
	/** Right-aligned, tabular numbers. */
	numeric?: boolean;
	sortable?: boolean;
	/** For icon-only columns (e.g. the row menu): the header is for screen readers only. */
	srOnlyHeader?: boolean;
	class?: string;
	headerClass?: string;
};

export type SortDirection = 'asc' | 'desc';
export type SortState = { column: string; direction: SortDirection };

export type Pagination = {
	/** 1-based. */
	page: number;
	pageSize: number;
	total: number;
	href: (page: number) => string;
};

/** "Showing 21–40 of 134", plus whether there's a previous/next page. */
export function pageSummary({ page, pageSize, total }: Pick<Pagination, 'page' | 'pageSize' | 'total'>) {
	const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const last = Math.min(page * pageSize, total);
	return {
		text: total === 0 ? 'No results' : `Showing ${first}–${last} of ${total}`,
		prev: page > 1,
		next: last < total
	};
}

/** Read `?sort=column&dir=asc|desc`, falling back to a default. */
export function readSort(url: URL, allowed: readonly string[], fallback: SortState): SortState {
	const column = url.searchParams.get('sort');
	const dir = url.searchParams.get('dir');
	if (!column || !allowed.includes(column)) return fallback;
	return { column, direction: dir === 'asc' ? 'asc' : 'desc' };
}

/** Read `?page=`, clamped to 1 or more. */
export function readPage(url: URL): number {
	const page = Number(url.searchParams.get('page'));
	return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * The URL for sorting by `column`: toggles direction when it's already the
 * sort column, otherwise starts descending. Resets to page 1.
 */
export function sortHrefFor(url: URL, current: SortState, column: string): string {
	const next = new URL(url);
	const direction: SortDirection =
		current.column === column && current.direction === 'desc' ? 'asc' : 'desc';
	next.searchParams.set('sort', column);
	next.searchParams.set('dir', direction);
	next.searchParams.delete('page');
	return `${next.pathname}${next.search}`;
}

/** The URL for a page, keeping every other query parameter. */
export function pageHrefFor(url: URL, page: number): string {
	const next = new URL(url);
	if (page <= 1) next.searchParams.delete('page');
	else next.searchParams.set('page', String(page));
	return `${next.pathname}${next.search}`;
}

/** The URL with one parameter set (or removed when empty), page reset. For tabs and filters. */
export function withParam(url: URL, name: string, value: string | null | undefined): string {
	const next = new URL(url);
	if (value === null || value === undefined || value === '') next.searchParams.delete(name);
	else next.searchParams.set(name, value);
	next.searchParams.delete('page');
	return `${next.pathname}${next.search}`;
}
