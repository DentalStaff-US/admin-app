/**
 * Pure helpers for the admin taxonomy screens (disciplines, experience levels,
 * skill categories, skills, documents, blacklists). These lists are small and
 * loaded whole, so sorting and paging happen in the browser, but the sort and
 * page still live in the URL (DataTable renders links) so a view can be shared.
 */
import type { SortState } from '$dtss/tableState';

export type SortAccessor<T> = (row: T) => string | number | null | undefined;

/** Sort a copy of `rows` by the accessor for `sort.column`; nulls always last. */
export function sortRows<T>(
	rows: readonly T[],
	accessors: Record<string, SortAccessor<T>>,
	sort: SortState | null
): T[] {
	const copy = [...rows];
	const get = sort ? accessors[sort.column] : undefined;
	if (!sort || !get) return copy;
	const dir = sort.direction === 'asc' ? 1 : -1;
	return copy.sort((a, b) => {
		const va = get(a);
		const vb = get(b);
		const aNull = va === null || va === undefined || va === '';
		const bNull = vb === null || vb === undefined || vb === '';
		if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
		if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
		return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true }) * dir;
	});
}

/** One page of rows (1-based), with the page clamped into range. */
export function pageRows<T>(rows: readonly T[], page: number, pageSize: number): { rows: T[]; page: number } {
	const last = Math.max(1, Math.ceil(rows.length / pageSize));
	const clamped = Math.min(Math.max(1, page), last);
	return { rows: rows.slice((clamped - 1) * pageSize, clamped * pageSize), page: clamped };
}

/** The full id order with `id` moved one step up (-1) or down (+1). Unchanged at the ends. */
export function movedOrder(ids: readonly string[], id: string, delta: -1 | 1): string[] {
	const next = [...ids];
	const i = next.indexOf(id);
	const j = i + delta;
	if (i < 0 || j < 0 || j >= next.length) return next;
	[next[i], next[j]] = [next[j], next[i]];
	return next;
}

/** "3 skills", "1 skill". */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
	return `${count} ${count === 1 ? noun : pluralNoun}`;
}

/** "Nov 3, 2026" for list cells. */
export function shortDate(value: string | Date | null | undefined): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export const DOCUMENT_TYPES = ['RESUME', 'LICENSE', 'CERTIFICATE', 'AGREEMENT', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** "CERTIFICATE" → "Certificate". */
export function documentTypeLabel(type: string): string {
	return type.charAt(0) + type.slice(1).toLowerCase();
}
