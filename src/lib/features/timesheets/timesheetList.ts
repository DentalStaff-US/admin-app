/**
 * Row shaping, tabs, filters, sorting and paging for the timesheets list. The
 * list is loaded once per request by the existing (role-scoped) queries and
 * shaped here, so the tab, filters, sort and page all live in the URL.
 */
import type { SortState } from '$lib/components/dtss/tableState';
import { readPage, readSort } from '$lib/components/dtss/tableState';
import { weekRangeLabel } from './timesheets';

export type TimesheetListRow = {
	id: string;
	status: string;
	wagesStatus: string | null;
	professional: string;
	practice: string | null;
	discipline: string | null;
	requisitionId: number | null;
	weekBeginDate: string | null;
	weekLabel: string;
	hours: number;
};

export const TIMESHEET_TABS = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'review', label: 'Pending' },
	{ value: 'discrepancies', label: 'Discrepancies' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'paid', label: 'Paid' },
	{ value: 'all', label: 'All' },
	{ value: 'voided', label: 'Voided' }
] as const;

export type TimesheetTab = (typeof TIMESHEET_TABS)[number]['value'];

const TAB_VALUES = TIMESHEET_TABS.map((t) => t.value) as readonly string[];
export const TIMESHEET_SORTS = ['professional', 'practice', 'week', 'hours', 'status'] as const;
export const DEFAULT_TIMESHEET_SORT: SortState = { column: 'week', direction: 'desc' };

/** One row from getAllTimesheetsAdmin / getAllTimesheetsForClient. */
export function toTimesheetListRow(raw: any): TimesheetListRow {
	const t = raw?.timesheet ?? {};
	const name = `${raw?.candidate?.firstName ?? ''} ${raw?.candidate?.lastName ?? ''}`.trim();
	return {
		id: String(t.id),
		status: t.status ?? 'DRAFT',
		wagesStatus: t.wagesStatus ?? null,
		professional: name || 'Unknown professional',
		// Only the admin query joins the company; practices see their own sheets.
		practice: raw?.clientCompany?.companyName ?? null,
		discipline: raw?.requisition?.disciplineName ?? null,
		requisitionId: raw?.requisition?.id ?? null,
		weekBeginDate: t.weekBeginDate ? String(t.weekBeginDate) : null,
		weekLabel: weekRangeLabel(t.weekBeginDate),
		hours: Number(t.totalHoursWorked) || 0
	};
}

/**
 * Which tab a sheet belongs to. Voided sheets only appear under Voided; "All"
 * is every active sheet (drafts and rejected ones included).
 */
export function inTab(row: Pick<TimesheetListRow, 'status' | 'wagesStatus'>, tab: TimesheetTab): boolean {
	if (tab === 'voided') return row.status === 'VOID';
	if (row.status === 'VOID') return false;
	switch (tab) {
		case 'draft':
			return row.status === 'DRAFT';
		case 'review':
			return row.status === 'PENDING';
		case 'discrepancies':
			return row.status === 'DISCREPANCY';
		case 'approved':
			return row.status === 'APPROVED' && row.wagesStatus !== 'WAGES_PAID';
		case 'paid':
			return row.status === 'APPROVED' && row.wagesStatus === 'WAGES_PAID';
		default:
			return true;
	}
}

export function countTabs(rows: Pick<TimesheetListRow, 'status' | 'wagesStatus'>[]): Record<TimesheetTab, number> {
	const counts = Object.fromEntries(TIMESHEET_TABS.map((t) => [t.value, 0])) as Record<TimesheetTab, number>;
	for (const row of rows) for (const t of TIMESHEET_TABS) if (inTab(row, t.value)) counts[t.value]++;
	return counts;
}

/** The stages a timesheet moves through, as the list's tabs name them. */
export const TIMESHEET_STAGES = ['draft', 'review', 'discrepancies', 'approved', 'paid'] as const satisfies readonly TimesheetTab[];

export type TimesheetListQuery = {
	tab: TimesheetTab;
	practice: string[];
	discipline: string[];
	wages: string[];
	sort: SortState;
	page: number;
};

const list = (url: URL, name: string) =>
	(url.searchParams.get(name) ?? '')
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);

export function readTimesheetListQuery(url: URL): TimesheetListQuery {
	const tab = url.searchParams.get('tab') ?? 'review';
	return {
		tab: (TAB_VALUES.includes(tab) ? tab : 'review') as TimesheetTab,
		practice: list(url, 'practice'),
		discipline: list(url, 'discipline'),
		wages: list(url, 'wages'),
		sort: readSort(url, TIMESHEET_SORTS, DEFAULT_TIMESHEET_SORT),
		page: readPage(url)
	};
}

export type FacetOption = { value: string; label: string; count: number };

function facet(rows: TimesheetListRow[], pick: (r: TimesheetListRow) => string | null): FacetOption[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const v = pick(row);
		if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([value, count]) => ({ value, label: value, count }));
}

const WAGES_LABEL: Record<string, string> = { WAGES_DUE: 'Wages due', WAGES_PAID: 'Wages paid', NONE: 'Not set' };

function compare(a: TimesheetListRow, b: TimesheetListRow, column: string): number {
	switch (column) {
		case 'professional':
			return a.professional.localeCompare(b.professional);
		case 'practice':
			return (a.practice ?? '').localeCompare(b.practice ?? '');
		case 'hours':
			return a.hours - b.hours;
		case 'status':
			return a.status.localeCompare(b.status);
		default:
			return (a.weekBeginDate ?? '').localeCompare(b.weekBeginDate ?? '');
	}
}

/** Filter → count tabs → keep the tab → sort → page. */
export function shapeTimesheetList(rows: TimesheetListRow[], query: TimesheetListQuery, pageSize = 20) {
	const filtered = rows.filter(
		(r) =>
			(!query.practice.length || (r.practice !== null && query.practice.includes(r.practice))) &&
			(!query.discipline.length || (r.discipline !== null && query.discipline.includes(r.discipline))) &&
			(!query.wages.length || query.wages.includes(r.wagesStatus ?? 'NONE'))
	);
	const counts = countTabs(filtered);
	const inCurrentTab = filtered.filter((r) => inTab(r, query.tab));
	const dir = query.sort.direction === 'asc' ? 1 : -1;
	const sorted = [...inCurrentTab].sort((a, b) => dir * compare(a, b, query.sort.column) || a.id.localeCompare(b.id));
	const lastPage = Math.max(1, Math.ceil(sorted.length / pageSize));
	const page = Math.min(query.page, lastPage);

	const tabRows = rows.filter((r) => inTab(r, query.tab));
	return {
		rows: sorted.slice((page - 1) * pageSize, page * pageSize),
		total: sorted.length,
		page,
		pageSize,
		counts,
		facets: {
			practice: facet(tabRows, (r) => r.practice),
			discipline: facet(tabRows, (r) => r.discipline),
			wages: facet(tabRows, (r) => r.wagesStatus ?? 'NONE').map((o) => ({ ...o, label: WAGES_LABEL[o.value] ?? o.value }))
		}
	};
}

export type TimesheetList = ReturnType<typeof shapeTimesheetList>;
