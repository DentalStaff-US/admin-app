/**
 * The Requests list (design doc 06 › Requests list): tabs, filters, sort and
 * fill progress, as pure functions over the rows the existing tenancy-scoped
 * queries return. The page is server-driven: everything here reads the URL.
 */

export type ListDay = {
	dayStart: Date | string;
	dayEnd: Date | string;
	status: string;
};

export type ListRow = {
	id: number;
	title: string | null;
	status: string;
	createdAt: Date | string;
	hourlyRate: number | null;
	permanentPosition: boolean | null;
	referenceTimezone: string;
	locationId: string;
	locationName: string;
	companyId: string;
	companyName: string;
	disciplineName: string;
	/** Admin-only: a perm placement with no live invoice. */
	unbilled?: boolean;
	/** Non-archived days. */
	days: ListDay[];
	/** Permanent only: people in the running (pending + approved applications). */
	applicantCount?: number;
};

export const LIST_TABS = ['open', 'filled', 'past', 'permanent', 'all'] as const;
export type ListTab = (typeof LIST_TABS)[number];

export function parseTab(value: string | null | undefined, fallback: ListTab = 'open'): ListTab {
	return (LIST_TABS as readonly string[]).includes(value ?? '') ? (value as ListTab) : fallback;
}

const ENDED_STATUSES = new Set(['CLOSED', 'CANCELED', 'PAYMENT_RECEIVED']);
const t = (d: Date | string) => new Date(d).getTime();

/** Days that still count toward filling: not canceled. */
export function activeDays(row: Pick<ListRow, 'days'>): ListDay[] {
	return row.days.filter((d) => d.status !== 'CANCELED');
}

export type FillStats = { filled: number; total: number; percent: number };

/** "3/5 days filled": filled days over days that weren't canceled. */
export function fillProgress(row: Pick<ListRow, 'days'>): FillStats {
	const days = activeDays(row);
	const filled = days.filter((d) => d.status === 'FILLED').length;
	return {
		filled,
		total: days.length,
		percent: days.length === 0 ? 0 : Math.round((filled / days.length) * 100)
	};
}

/**
 * Past: the request ended (closed, canceled, fee received), or a temp request
 * whose last day has finished.
 */
export function isPast(row: ListRow, now: Date): boolean {
	if (ENDED_STATUSES.has(row.status)) return true;
	if (row.permanentPosition) return false;
	const days = activeDays(row);
	if (days.length === 0) return false;
	return Math.max(...days.map((d) => t(d.dayEnd))) < now.getTime();
}

/**
 * Filled: not past, and nothing left to fill. Temp: every remaining upcoming
 * day is FILLED. Permanent: someone was hired (PAYMENT_REQUIRED).
 */
export function isFilled(row: ListRow, now: Date): boolean {
	if (isPast(row, now)) return false;
	if (row.permanentPosition) return row.status === 'PAYMENT_REQUIRED';
	const upcoming = activeDays(row).filter((d) => t(d.dayEnd) >= now.getTime());
	return upcoming.length > 0 && upcoming.every((d) => d.status === 'FILLED');
}

export function tabOf(row: ListRow, now: Date): 'open' | 'filled' | 'past' {
	if (isPast(row, now)) return 'past';
	if (isFilled(row, now)) return 'filled';
	return 'open';
}

export function inTab(row: ListRow, tab: ListTab, now: Date): boolean {
	if (tab === 'all') return true;
	if (tab === 'permanent') return !!row.permanentPosition && !isPast(row, now);
	return tabOf(row, now) === tab;
}

export type ListFilters = {
	location: string[];
	discipline: string[];
	/** 'temp' | 'permanent' */
	type: string[];
	status: string[];
	practice: string[];
	/** yyyy-mm-dd, inclusive. */
	from: string | null;
	to: string | null;
};

const list = (url: URL, name: string) =>
	url.searchParams
		.getAll(name)
		.flatMap((v) => v.split(','))
		.map((v) => v.trim())
		.filter(Boolean);

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function readFilters(url: URL): ListFilters {
	return {
		location: list(url, 'location'),
		discipline: list(url, 'discipline'),
		type: list(url, 'type').filter((v) => v === 'temp' || v === 'permanent'),
		status: list(url, 'status'),
		practice: list(url, 'practice'),
		from: isoDate(url.searchParams.get('from')),
		to: isoDate(url.searchParams.get('to'))
	};
}

/**
 * A row is in a date range when any of its days overlaps it (temp), or it was
 * posted in it (permanent, which has no days).
 */
export function inDateRange(row: ListRow, from: string | null, to: string | null): boolean {
	if (!from && !to) return true;
	const start = from ? t(`${from}T00:00:00Z`) : -Infinity;
	const end = to ? t(`${to}T23:59:59Z`) : Infinity;
	if (row.permanentPosition || row.days.length === 0) {
		const posted = t(row.createdAt);
		return posted >= start && posted <= end;
	}
	return row.days.some((d) => t(d.dayEnd) >= start && t(d.dayStart) <= end);
}

export function matchesFilters(row: ListRow, f: ListFilters): boolean {
	if (f.location.length && !f.location.includes(row.locationId)) return false;
	if (f.discipline.length && !f.discipline.includes(row.disciplineName)) return false;
	if (f.practice.length && !f.practice.includes(row.companyId)) return false;
	if (f.status.length && !f.status.includes(row.status)) return false;
	if (f.type.length) {
		const type = row.permanentPosition ? 'permanent' : 'temp';
		if (!f.type.includes(type)) return false;
	}
	return inDateRange(row, f.from, f.to);
}

/** First day of a request (for sorting and the Dates column). */
export function firstDay(row: ListRow): number | null {
	const days = activeDays(row);
	return days.length ? Math.min(...days.map((d) => t(d.dayStart))) : null;
}

export const SORTABLE = ['request', 'location', 'dates', 'rate', 'status', 'fill'] as const;

export function sortRows(
	rows: ListRow[],
	sort: { column: string; direction: 'asc' | 'desc' }
): ListRow[] {
	const dir = sort.direction === 'asc' ? 1 : -1;
	const key = (row: ListRow): string | number => {
		switch (sort.column) {
			case 'request':
				return (row.title || row.disciplineName || '').toLowerCase();
			case 'location':
				return row.locationName.toLowerCase();
			case 'dates':
				return firstDay(row) ?? t(row.createdAt);
			case 'rate':
				return row.hourlyRate ?? -1;
			case 'status':
				return row.status;
			case 'fill':
				return row.permanentPosition ? (row.applicantCount ?? 0) : fillProgress(row).percent;
			default:
				return t(row.createdAt);
		}
	};
	return [...rows].sort((a, b) => {
		const ka = key(a);
		const kb = key(b);
		if (ka < kb) return -1 * dir;
		if (ka > kb) return 1 * dir;
		return b.id - a.id;
	});
}

export type FacetOption = { value: string; label: string; count: number };

/** Filter options built from the rows the caller may see, with counts. */
export function facets(rows: ListRow[]) {
	const tally = (pick: (r: ListRow) => [string, string]) => {
		const map = new Map<string, FacetOption>();
		for (const row of rows) {
			const [value, label] = pick(row);
			const entry = map.get(value) ?? { value, label, count: 0 };
			entry.count++;
			map.set(value, entry);
		}
		return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
	};
	return {
		location: tally((r) => [r.locationId, r.locationName]),
		discipline: tally((r) => [r.disciplineName, r.disciplineName]),
		practice: tally((r) => [r.companyId, r.companyName]),
		status: tally((r) => [r.status, r.status]),
		type: tally((r) => (r.permanentPosition ? ['permanent', 'Permanent'] : ['temp', 'Temp']))
	};
}

/** Everything the list page needs from the full row set, for one URL. */
export function buildList(
	rows: ListRow[],
	opts: {
		tab: ListTab;
		filters: ListFilters;
		sort: { column: string; direction: 'asc' | 'desc' };
		page: number;
		pageSize: number;
		now: Date;
	}
) {
	const filtered = rows.filter((r) => matchesFilters(r, opts.filters));
	const counts = Object.fromEntries(
		LIST_TABS.map((tab) => [tab, filtered.filter((r) => inTab(r, tab, opts.now)).length])
	) as Record<ListTab, number>;
	const inCurrentTab = sortRows(
		filtered.filter((r) => inTab(r, opts.tab, opts.now)),
		opts.sort
	);
	const pages = Math.max(1, Math.ceil(inCurrentTab.length / opts.pageSize));
	const page = Math.min(Math.max(1, opts.page), pages);
	return {
		counts,
		total: inCurrentTab.length,
		page,
		rows: inCurrentTab.slice((page - 1) * opts.pageSize, page * opts.pageSize)
	};
}
