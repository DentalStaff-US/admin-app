import type { RequisitionBilling, RequisitionBillingInvoice } from './billing';

// Pure rules behind the requisition Billing tab, kept DB-free so they're unit-tested.

/**
 * Admin (no clientId) sees every invoice, voids included — the void is part of
 * the billing history. A client sees only their own, and never voids.
 */
export function visibleToViewer(
	inv: { clientId: string | null; status: string },
	clientId: string | undefined
): boolean {
	if (clientId === undefined) return true;
	return inv.clientId === clientId && inv.status !== 'void';
}

/** Totals over live (non-void) invoices; `unbilled` mirrors `unbilledPlacementCondition`. */
export function summarizeBilling(
	invoices: Pick<
		RequisitionBillingInvoice,
		'status' | 'total' | 'amountPaid' | 'amountRemaining'
	>[],
	requisition: { status: string | null; permanentPosition: boolean | null }
): RequisitionBilling['summary'] {
	const live = invoices.filter((i) => i.status !== 'void');
	const sum = (f: (i: (typeof live)[number]) => number) =>
		Math.round(live.reduce((acc, i) => acc + f(i), 0) * 100) / 100;
	return {
		totalBilled: sum((i) => i.total),
		totalPaid: sum((i) => i.amountPaid),
		outstanding: sum((i) => i.amountRemaining),
		unbilled:
			!!requisition.permanentPosition &&
			requisition.status === 'PAYMENT_REQUIRED' &&
			live.length === 0
	};
}
