/**
 * Affiliate commission maths.
 *
 * Pure and dependency-free: no DB, no env, no Stripe. The impure applier
 * (src/lib/server/affiliate/accrual.ts) reads the config and the timesheet, calls
 * `computeHoursBreakdown` from queries/requisitions.ts, and hands the result here.
 *
 * THE RULE (locked with the client):
 *   base       = REGULAR hours only. Overtime is NOT commissionable.
 *   commission = round_half_up(base × rate)
 *   rate       = affiliate override ?? program default (2.5%)
 *
 * Excluding overtime makes the commission base exactly congruent with the
 * Administration Fee, which is likewise regular-hours-only — so commission stays
 * a stable share of margin no matter how much overtime a shift runs.
 */

/**
 * Structural mirror of `HoursBreakdown` from queries/requisitions.ts. Redeclared
 * rather than imported so this module pulls in no DB/Stripe dependencies.
 */
export type HoursBreakdownLike = {
	regularHours: number;
	overtimeHours: number;
	regularCents: number;
	overtimeCents: number;
	billableCents: number;
};

export type RateSource = 'AFFILIATE_OVERRIDE' | 'PROGRAM_DEFAULT';

export type ResolvedRate = {
	/** Percent, e.g. 2.5 means 2.5%. */
	ratePercent: number;
	source: RateSource;
};

/**
 * Most specific wins: a per-affiliate negotiated rate beats the program default.
 *
 * Both inputs arrive as numeric(5,2), which node-postgres returns as strings.
 * A null/undefined/blank override means "no override" — but an explicit 0 is a
 * real rate (a suspended-earning affiliate) and must NOT fall through.
 */
export function resolveCommissionRate(input: {
	affiliateOverride: string | number | null | undefined;
	programDefault: string | number;
}): ResolvedRate {
	const override = toRate(input.affiliateOverride);
	if (override !== null) {
		return { ratePercent: override, source: 'AFFILIATE_OVERRIDE' };
	}
	const fallback = toRate(input.programDefault);
	if (fallback === null) {
		throw new Error('Affiliate program default commission rate is missing or invalid');
	}
	return { ratePercent: fallback, source: 'PROGRAM_DEFAULT' };
}

function toRate(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	const n = typeof value === 'number' ? value : parseFloat(value);
	if (!Number.isFinite(n) || n < 0) return null;
	return n;
}

/**
 * Round half AWAY FROM ZERO, so a negative adjustment mirrors its positive
 * counterpart exactly. (Math.round alone rounds -0.5 to -0, which would make a
 * reversal differ from the event it reverses by a cent.)
 */
export function roundHalfUp(n: number): number {
	return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * The commissionable base, in cents.
 *
 * Takes the whole breakdown but reads ONLY `regularCents` — deliberately, so a
 * test can vary the overtime fields and prove they cannot move the number.
 */
export function commissionableBaseCents(breakdown: HoursBreakdownLike): number {
	return breakdown.regularCents;
}

/** commission = round_half_up(baseCents × ratePercent / 100). */
export function computeCommissionCents(baseCents: number, ratePercent: number): number {
	if (!Number.isFinite(baseCents)) throw new Error('Invalid baseCents');
	if (!Number.isFinite(ratePercent) || ratePercent < 0) throw new Error('Invalid ratePercent');
	// Divide last to keep as much precision as possible.
	return roundHalfUp((baseCents * ratePercent) / 100);
}

/**
 * Frozen record of how a commission number was produced. Persisted verbatim on
 * the ledger row so a later rate change — or a newly added per-affiliate
 * override — can never retroactively rewrite what was already earned.
 */
export type CommissionRuleSnapshot = {
	version: 1;
	ratePercent: number;
	rateSource: RateSource;
	basis: 'REGULAR_HOURS_ONLY';
	regularHours: number;
	overtimeHours: number;
	regularCents: number;
	/** Recorded for transparency; excluded from the base by design. */
	excludedOvertimeCents: number;
	baseCents: number;
	commissionCents: number;
};

export type CommissionComputation = {
	baseCents: number;
	commissionCents: number;
	/** Dollar strings, ready for the numeric(12,2) columns. */
	grossAmount: string;
	commissionAmount: string;
	rate: ResolvedRate;
	snapshot: CommissionRuleSnapshot;
};

/**
 * The single entry point the accrual path uses. Produces both the amounts and
 * the snapshot in one shot so they can never disagree.
 */
export function computeCommission(input: {
	breakdown: HoursBreakdownLike;
	affiliateOverride: string | number | null | undefined;
	programDefault: string | number;
}): CommissionComputation {
	const rate = resolveCommissionRate(input);
	const baseCents = commissionableBaseCents(input.breakdown);
	const commissionCents = computeCommissionCents(baseCents, rate.ratePercent);

	return {
		baseCents,
		commissionCents,
		grossAmount: centsToDollarString(baseCents),
		commissionAmount: centsToDollarString(commissionCents),
		rate,
		snapshot: {
			version: 1,
			ratePercent: rate.ratePercent,
			rateSource: rate.source,
			basis: 'REGULAR_HOURS_ONLY',
			regularHours: input.breakdown.regularHours,
			overtimeHours: input.breakdown.overtimeHours,
			regularCents: input.breakdown.regularCents,
			excludedOvertimeCents: input.breakdown.overtimeCents,
			baseCents,
			commissionCents
		}
	};
}

/** Integer cents -> the dollar string shape the numeric(12,2) columns expect. */
export function centsToDollarString(cents: number): string {
	return (cents / 100).toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Deriving the base from an invoice                                          */
/* -------------------------------------------------------------------------- */

/**
 * The line-item descriptions written by approveTimesheet.ts / stripe.ts. Pinned
 * here so the exclusion rules below have one place to change.
 *
 * NOTE: the REGULAR hours line has variable text ("Regular hours worked for
 * {candidateName}"), so it is identified by EXCLUSION rather than by matching —
 * which also means a future line type defaults to being treated as labour, and
 * would be caught by the reconciliation check rather than silently mis-priced.
 */
export const ADMIN_FEE_LINE_DESCRIPTION = 'Administration Fees';
export const OVERTIME_LINE_PREFIX = 'Overtime hours';
export const PROCESSING_FEE_LINE_PREFIX = 'Processing Fee';
export const EXPENSE_LINE_PREFIX = 'Expense: ';

export type InvoiceLineItemLike = {
	description?: string | null;
	amount?: number | null;
};

/**
 * Sum the REGULAR-hours cents on an invoice — the commissionable base as the
 * client was actually billed.
 *
 * Preferred over recomputing from the timesheet because the regular/overtime
 * split can shift as sibling timesheets in the same week are approved, whereas
 * the invoice is a fixed record of what was charged.
 *
 * Returns null when the shape is unrecognisable, so the caller falls back to
 * recomputation rather than silently commissioning zero.
 */
export function extractRegularCentsFromInvoice(
	lineItems: InvoiceLineItemLike[] | null | undefined
): number | null {
	if (!Array.isArray(lineItems) || lineItems.length === 0) return null;

	let regular = 0;
	let sawLabourLine = false;

	for (const item of lineItems) {
		const description = (item?.description ?? '').trim();
		const amount = typeof item?.amount === 'number' ? item.amount : null;
		if (amount === null) continue;

		if (description === ADMIN_FEE_LINE_DESCRIPTION) continue;
		if (description.startsWith(PROCESSING_FEE_LINE_PREFIX)) continue;
		if (description.startsWith(OVERTIME_LINE_PREFIX)) continue;
		if (description.startsWith(EXPENSE_LINE_PREFIX)) continue;

		regular += amount;
		sawLabourLine = true;
	}

	return sawLabourLine ? regular : null;
}

export type BaseSource = 'INVOICE_LINE_ITEMS' | 'RECOMPUTED';

export type ResolvedBase = {
	baseCents: number;
	source: BaseSource;
	/**
	 * Set when the invoice and the recomputed figure disagree. Not an error —
	 * a split week legitimately produces this — but it is surfaced to admins so
	 * a genuine mismatch is never invisible.
	 */
	discrepancyCents?: number;
};

/**
 * Choose the commissionable base, preferring the invoice over recomputation and
 * recording any disagreement.
 */
export function resolveCommissionBase(input: {
	invoiceLineItems: InvoiceLineItemLike[] | null | undefined;
	recomputed: HoursBreakdownLike;
}): ResolvedBase {
	const recomputedCents = commissionableBaseCents(input.recomputed);
	const fromInvoice = extractRegularCentsFromInvoice(input.invoiceLineItems);

	if (fromInvoice === null) {
		return { baseCents: recomputedCents, source: 'RECOMPUTED' };
	}

	const discrepancy = fromInvoice - recomputedCents;
	return {
		baseCents: fromInvoice,
		source: 'INVOICE_LINE_ITEMS',
		...(discrepancy !== 0 ? { discrepancyCents: discrepancy } : {})
	};
}
