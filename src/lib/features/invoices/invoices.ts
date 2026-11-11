/**
 * Pure helpers for the invoice screens: list rows, tabs, filters and paging,
 * line items, and the payment-method notice.
 */
import type { SortState } from '$lib/components/dtss/tableState';
import { readPage, readSort } from '$lib/components/dtss/tableState';

export type InvoiceListRow = {
	id: string;
	number: string;
	status: string;
	method: 'PAPER' | 'STRIPE';
	practice: string | null;
	professional: string | null;
	requisitionId: number | null;
	createdAt: string | null;
	dueDate: string | null;
	total: number;
	overdue: boolean;
};

export const INVOICE_TABS = [
	{ value: 'all', label: 'All' },
	{ value: 'open', label: 'Open' },
	{ value: 'overdue', label: 'Overdue' },
	{ value: 'paid', label: 'Paid' },
	{ value: 'voided', label: 'Voided' }
] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number]['value'];
const TAB_VALUES = INVOICE_TABS.map((t) => t.value) as readonly string[];

export const INVOICE_SORTS = ['number', 'party', 'due', 'amount', 'status', 'created'] as const;
export const DEFAULT_INVOICE_SORT: SortState = { column: 'created', direction: 'desc' };

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

/** Past due and still collectable (the list's rule: paid and void are never overdue). */
export function isInvoiceOverdue(status: string, dueDate: unknown, today: Date = new Date()): boolean {
	if (!dueDate || status === 'paid' || status === 'void') return false;
	const start = new Date(today);
	start.setHours(0, 0, 0, 0);
	return new Date(dueDate as string) < start;
}

/** One row from getAllInvoicesAdmin / getClientInvoices. */
export function toInvoiceListRow(raw: any, today: Date = new Date()): InvoiceListRow {
	const inv = raw?.invoice ?? {};
	const name = `${raw?.candidate?.user?.firstName ?? ''} ${raw?.candidate?.user?.lastName ?? ''}`.trim();
	return {
		id: String(inv.id),
		number: String(inv.invoiceNumber ?? ''),
		status: inv.status ?? 'draft',
		method: inv.invoiceType === 'PAPER' ? 'PAPER' : 'STRIPE',
		practice: raw?.company?.companyName ?? null,
		professional: name || null,
		requisitionId: raw?.requisition?.id ?? null,
		createdAt: iso(inv.createdAt),
		dueDate: iso(inv.dueDate),
		total: Number(inv.total) || 0,
		overdue: isInvoiceOverdue(inv.status, inv.dueDate, today)
	};
}

export function inInvoiceTab(row: Pick<InvoiceListRow, 'status' | 'overdue'>, tab: InvoiceTab): boolean {
	switch (tab) {
		case 'open':
			return row.status === 'open';
		case 'paid':
			return row.status === 'paid';
		case 'overdue':
			return row.overdue;
		case 'voided':
			return row.status === 'void';
		default:
			return row.status !== 'void';
	}
}

export type InvoiceListQuery = {
	tab: InvoiceTab;
	practice: string[];
	method: string[];
	sort: SortState;
	page: number;
};

const list = (url: URL, name: string) =>
	(url.searchParams.get(name) ?? '')
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);

export function readInvoiceListQuery(url: URL): InvoiceListQuery {
	const tab = url.searchParams.get('tab') ?? 'all';
	return {
		tab: (TAB_VALUES.includes(tab) ? tab : 'all') as InvoiceTab,
		practice: list(url, 'practice'),
		method: list(url, 'method'),
		sort: readSort(url, INVOICE_SORTS, DEFAULT_INVOICE_SORT),
		page: readPage(url)
	};
}

function compare(a: InvoiceListRow, b: InvoiceListRow, column: string): number {
	switch (column) {
		case 'number':
			return a.number.localeCompare(b.number, undefined, { numeric: true });
		case 'party':
			return (a.practice ?? a.professional ?? '').localeCompare(b.practice ?? b.professional ?? '');
		case 'due':
			return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
		case 'amount':
			return a.total - b.total;
		case 'status':
			return a.status.localeCompare(b.status);
		default:
			return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
	}
}

const METHOD_LABEL: Record<string, string> = { PAPER: 'Paper', STRIPE: 'Stripe' };

export function shapeInvoiceList(rows: InvoiceListRow[], query: InvoiceListQuery, pageSize = 20) {
	const filtered = rows.filter(
		(r) =>
			(!query.practice.length || (r.practice !== null && query.practice.includes(r.practice))) &&
			(!query.method.length || query.method.includes(r.method))
	);
	const counts = Object.fromEntries(
		INVOICE_TABS.map((t) => [t.value, filtered.filter((r) => inInvoiceTab(r, t.value)).length])
	) as Record<InvoiceTab, number>;
	const dir = query.sort.direction === 'asc' ? 1 : -1;
	const sorted = filtered
		.filter((r) => inInvoiceTab(r, query.tab))
		.sort((a, b) => dir * compare(a, b, query.sort.column) || a.id.localeCompare(b.id));
	const lastPage = Math.max(1, Math.ceil(sorted.length / pageSize));
	const page = Math.min(query.page, lastPage);

	const tabRows = rows.filter((r) => inInvoiceTab(r, query.tab));
	const facet = (pick: (r: InvoiceListRow) => string | null, label = (v: string) => v) => {
		const counts = new Map<string, number>();
		for (const r of tabRows) {
			const v = pick(r);
			if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([value, count]) => ({ value, label: label(value), count }));
	};

	return {
		rows: sorted.slice((page - 1) * pageSize, page * pageSize),
		total: sorted.length,
		page,
		pageSize,
		counts,
		facets: {
			practice: facet((r) => r.practice),
			method: facet((r) => r.method, (v) => METHOD_LABEL[v] ?? v)
		}
	};
}

export type InvoiceList = ReturnType<typeof shapeInvoiceList>;

// ---------------------------------------------------------------------------
// Payments (admin)

export type PaperTransaction = {
	id: string;
	batchNumber: string | null;
	transactionType: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
	status: string;
	amount: string;
	details: { notes?: string; reversal?: boolean } | null;
	createdAt: string | Date;
};

/** One settled payment from Stripe's Invoice Payments API. */
export type StripePayment = { id: string; amount: number; status: string; paidAt: string | Date; reference: string | null };

// ---------------------------------------------------------------------------
// Line items

export type LineItemRow = {
	key: number;
	description: string;
	quantity: number;
	rate: number;
	amount: number;
};

/** Stripe-shaped line items (cents) → display rows (dollars). */
export function toLineItemRows(items: any[] | null | undefined): LineItemRow[] {
	return (items ?? []).map((item, i) => ({
		key: i,
		description: item?.description || 'Service',
		quantity: Number(item?.quantity) || 1,
		rate: Number(item?.unit_amount_excluding_tax ?? item?.unit_amount ?? 0) / 100,
		amount: Number(item?.amount) / 100 || 0
	}));
}

// ---------------------------------------------------------------------------
// Payment-method notice

export type MethodNotice = {
	tone: 'info' | 'warning';
	title: string;
	body: string;
};

/**
 * What to say about how this invoice gets paid. The practice's
 * `client_invoice_method` is authoritative: PAPER silently overrides a live
 * Stripe customer (timesheet approval included), so admins are told so in as
 * many words. The invoice's own type records how it was issued.
 */
export function invoiceMethodNotice(input: {
	invoiceType: string | null | undefined;
	clientMethod: string | null | undefined;
	isAdmin: boolean;
}): MethodNotice {
	const issuedOnPaper = input.invoiceType === 'PAPER';
	const practiceOnPaper = (input.clientMethod ?? 'STRIPE') === 'PAPER';

	if (!input.isAdmin) {
		return issuedOnPaper
			? {
					tone: 'info',
					title: 'Paper invoice',
					body: "This invoice isn't charged to a card or bank account. Pay it as shown on the PDF; DTSS records the payment when it arrives."
				}
			: {
					tone: 'info',
					title: 'Pay online',
					body: 'This invoice is collected through Stripe. Use Pay invoice to pay by card or bank transfer.'
				};
	}

	if (practiceOnPaper) {
		return {
			tone: issuedOnPaper ? 'info' : 'warning',
			title: 'Paper invoicing is on for this practice',
			body:
				'client_invoice_method = PAPER overrides a connected Stripe customer: new invoices for this practice, including the ones created when a timesheet is approved, are paper invoices and are never charged through Stripe. Record payments here by hand.' +
				(issuedOnPaper ? '' : ' This invoice was issued through Stripe before the switch, so it stays a Stripe invoice.')
		};
	}

	return issuedOnPaper
		? {
				tone: 'warning',
				title: 'Issued on paper; the practice now pays through Stripe',
				body: 'This invoice was issued while client_invoice_method was PAPER. New invoices go through Stripe, but this one is still paid by hand: record its payments here.'
			}
		: {
				tone: 'info',
				title: 'Billed through Stripe',
				body: 'client_invoice_method = STRIPE. DTSS emails the invoice to the billing contact; Stripe collects the payment. Switching the practice to PAPER would override its Stripe customer for new invoices.'
			};
}
