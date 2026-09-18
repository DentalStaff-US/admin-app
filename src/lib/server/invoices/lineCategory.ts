/**
 * Structural category for invoice line items.
 *
 * Before this existed, anything that needed to know what a line WAS (e.g. the
 * affiliate commission base = regular-hours labour only) had to string-match
 * the description — "Administration Fees", "Overtime hours (1.5×)"… A copy
 * edit to any of those silently mispriced commission. The category travels
 * with the line instead: Stripe lines carry it in `metadata.category`, paper
 * lines as a top-level `category` field.
 *
 * Dependency-free so it can be imported from anywhere, including tsx scripts.
 */
export const INVOICE_LINE_CATEGORIES = [
	'LABOR_REGULAR',
	'LABOR_OVERTIME',
	'EXPENSE',
	'ADMIN_FEE',
	'PROCESSING_FEE',
	'PLACEMENT_FEE',
	'OTHER'
] as const;

export type InvoiceLineCategory = (typeof INVOICE_LINE_CATEGORIES)[number];

export function isInvoiceLineCategory(v: unknown): v is InvoiceLineCategory {
	return typeof v === 'string' && (INVOICE_LINE_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Read a category off any line-item shape we persist: Stripe (`metadata`),
 * paper (`category`), or nothing (legacy). Returns null when absent so callers
 * can fall back to description matching for invoices created before tagging.
 */
export function lineCategoryOf(item: {
	category?: unknown;
	metadata?: { category?: unknown } | null;
}): InvoiceLineCategory | null {
	if (isInvoiceLineCategory(item.category)) return item.category;
	const meta = item.metadata?.category;
	return isInvoiceLineCategory(meta) ? meta : null;
}
