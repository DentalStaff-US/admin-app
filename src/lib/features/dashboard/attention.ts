/**
 * Needs attention / Waiting on you (10 §3.1, §4.1): kind metadata and the pure
 * queue builder. Each kind's rows and COUNT(*) come from one server query; this
 * merges them, sorts by priority, applies the chip filter and the 10-row limit.
 */
import type { StatusTone } from '$tokens/status';
import {
	ATTENTION_CATEGORIES,
	type AttentionCategory,
	type AttentionGroup,
	type AttentionItem,
	type AttentionKind
} from './types';

export type KindMeta = {
	category: AttentionCategory;
	/** 1 = most urgent (10 §3.1 table). */
	priority: number;
	tone: StatusTone;
	/** Plural noun for "See all 14 …" links. */
	noun: string;
	/** The list page that shows exactly this set; null when none supports the filter yet. */
	listHref: string | null;
};

export const KIND_META: Record<AttentionKind, KindMeta> = {
	UNFILLED_SOON: { category: 'shifts', priority: 1, tone: 'warning', noun: 'open shifts in the next 48h', listHref: '/calendar' },
	COMPLIANCE_CRITICAL: { category: 'people', priority: 1, tone: 'negative', noun: 'booked professionals with expired credentials', listHref: '/admin/compliance?severity=CRITICAL' },
	TIMESHEET_DISCREPANCY: { category: 'timesheets', priority: 2, tone: 'warning', noun: 'timesheet discrepancies', listHref: '/timesheets?tab=discrepancy' },
	INVOICE_OVERDUE: { category: 'billing', priority: 3, tone: 'negative', noun: 'overdue invoices', listHref: '/invoices' },
	PERM_UNBILLED: { category: 'billing', priority: 3, tone: 'warning', noun: 'unbilled placements', listHref: '/requisitions?filter=unbilled' },
	COMPLIANCE_BLOCKED: { category: 'people', priority: 3, tone: 'negative', noun: 'blocked professionals', listHref: '/admin/compliance?severity=BLOCKED' },
	TIMESHEET_PENDING: { category: 'timesheets', priority: 4, tone: 'pending', noun: 'timesheets to review', listHref: '/timesheets?tab=pending' },
	PERM_APPLICANTS_WAITING: { category: 'people', priority: 4, tone: 'pending', noun: 'permanent requests with applicants waiting', listHref: '/requisitions' },
	PRO_PENDING_APPROVAL: { category: 'people', priority: 5, tone: 'pending', noun: 'professionals awaiting approval', listHref: '/professionals?status=PENDING' },
	CLIENT_PENDING_APPROVAL: { category: 'people', priority: 5, tone: 'pending', noun: 'practices awaiting approval', listHref: '/clients?status=PENDING' },
	SUPPORT_OPEN: { category: 'support', priority: 6, tone: 'info', noun: 'open support tickets', listHref: '/support' },
	// Practices
	SIGNATURE_PENDING: { category: 'people', priority: 1, tone: 'pending', noun: 'agreements to sign', listHref: '/settings' },
	INVOICE_DUE: { category: 'billing', priority: 3, tone: 'info', noun: 'invoices due soon', listHref: '/invoices' },
	STAFF_NO_LOCATION: { category: 'people', priority: 5, tone: 'pending', noun: 'staff without a location', listHref: '/staff' }
};

export const CATEGORY_LABELS: Record<AttentionCategory, string> = {
	shifts: 'Shifts',
	timesheets: 'Timesheets',
	billing: 'Billing',
	people: 'People',
	support: 'Support'
};

export const QUEUE_LIMIT = 10;

export type AttentionFilter = AttentionCategory | 'all';

export function parseAttentionFilter(value: string | null | undefined): AttentionFilter {
	return (ATTENTION_CATEGORIES as readonly string[]).includes(value ?? '')
		? (value as AttentionCategory)
		: 'all';
}

/** Priority, then the most pressing date (shift start, due date), then oldest first. */
export function compareAttention(a: AttentionItem, b: AttentionItem): number {
	const p = KIND_META[a.kind].priority - KIND_META[b.kind].priority;
	if (p) return p;
	const at = new Date(a.dueAt ?? a.since).getTime();
	const bt = new Date(b.dueAt ?? b.since).getTime();
	if (at !== bt) return at - bt;
	return new Date(a.since).getTime() - new Date(b.since).getTime();
}

export type QueueChip = { value: AttentionFilter; label: string; count: number };

export type QueueOverflow = { kind: AttentionKind; noun: string; count: number; href: string | null };

export type AttentionQueue = {
	/** Sum of COUNT(*) across loaded kinds. */
	total: number;
	/** Kinds whose query failed: the queue can't claim "nothing needs you". */
	failedKinds: AttentionKind[];
	/** Chips for categories with work; an empty kind contributes no chip (10 §3.7). */
	chips: QueueChip[];
	/** Sorted rows for the active filter (all of those fetched). */
	items: AttentionItem[];
	/** Kinds with more rows than were fetched: "See all N …" links to the list page. */
	overflow: QueueOverflow[];
	/** The success state is shown only when every kind loaded and none has work. */
	allClear: boolean;
};

export function buildAttentionQueue(
	groups: AttentionGroup[],
	filter: AttentionFilter = 'all',
	removed: ReadonlySet<string> = new Set()
): AttentionQueue {
	const failedKinds: AttentionKind[] = [];
	const counts = new Map<AttentionCategory, number>();
	const items: AttentionItem[] = [];
	const overflow: QueueOverflow[] = [];
	let total = 0;

	for (const group of groups) {
		if (!group.result.ok) {
			failedKinds.push(group.kind);
			continue;
		}
		const meta = KIND_META[group.kind];
		const visible = group.result.value.items.filter((i) => !removed.has(i.id));
		// Optimistically removed rows leave the count too, so chip and list agree.
		const count = Math.max(0, group.result.value.count - (group.result.value.items.length - visible.length));
		if (count === 0) continue;
		total += count;
		counts.set(meta.category, (counts.get(meta.category) ?? 0) + count);
		if (filter === 'all' || filter === meta.category) {
			items.push(...visible);
			if (count > visible.length) {
				overflow.push({ kind: group.kind, noun: meta.noun, count, href: meta.listHref });
			}
		}
	}

	const chips: QueueChip[] = [];
	if (total > 0) chips.push({ value: 'all', label: 'All', count: total });
	for (const category of ATTENTION_CATEGORIES) {
		const count = counts.get(category) ?? 0;
		if (count > 0) chips.push({ value: category, label: CATEGORY_LABELS[category], count });
	}

	return {
		total,
		failedKinds,
		chips,
		items: items.sort(compareAttention),
		overflow,
		allClear: total === 0 && failedKinds.length === 0
	};
}

/** Split into the first `limit` rows and the rest ("Show N more" expands in place). */
export function limitRows<T>(rows: T[], expanded: boolean, limit = QUEUE_LIMIT): { shown: T[]; hidden: number } {
	if (expanded || rows.length <= limit) return { shown: rows, hidden: 0 };
	return { shown: rows.slice(0, limit), hidden: rows.length - limit };
}

/** "5 shifts in the next 48h are still open · 3 timesheets waiting on you" (10 §3 header). */
export function adminSummaryLine(groups: AttentionGroup[]): string | null {
	const count = (kind: AttentionKind) => {
		const g = groups.find((x) => x.kind === kind);
		return g?.result.ok ? g.result.value.count : 0;
	};
	const parts: string[] = [];
	const unfilled = count('UNFILLED_SOON');
	const critical = count('COMPLIANCE_CRITICAL');
	const pending = count('TIMESHEET_PENDING') + count('TIMESHEET_DISCREPANCY');
	if (unfilled) parts.push(`${unfilled} ${unfilled === 1 ? 'shift' : 'shifts'} in the next 48h ${unfilled === 1 ? 'is' : 'are'} still open`);
	if (critical) parts.push(`${critical} booked ${critical === 1 ? 'professional has' : 'professionals have'} an expired credential`);
	if (pending) parts.push(`${pending} ${pending === 1 ? 'timesheet' : 'timesheets'} waiting on you`);
	return parts.length ? parts.join(' · ') : null;
}
