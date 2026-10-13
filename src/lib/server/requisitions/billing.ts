import { asc, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { paperInvoiceTransactionTable } from '$lib/server/database/schemas/requisition';
import { getInvoicesByRequisitionId } from '$lib/server/database/queries/requisitions';
import { getStripeInvoicePayments } from '$lib/server/stripe';
import { logger } from '$lib/server/logger';
import { summarizeBilling, visibleToViewer } from '$lib/server/requisitions/billingRules';

export type RequisitionBillingInvoice = {
	id: string;
	invoiceNumber: string;
	status: string;
	invoiceType: 'STRIPE' | 'PAPER';
	total: number;
	amountPaid: number;
	amountRemaining: number;
	dueDate: Date | null;
	paidAt: Date | null;
	createdAt: Date;
	stripeHostedUrl: string | null;
	stripePdfUrl: string | null;
};

export type RequisitionPaymentRow = {
	id: string;
	invoiceId: string;
	invoiceNumber: string;
	date: Date;
	amount: number;
	method: 'PAPER' | 'STRIPE';
	type: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT';
	status: string;
	/** Admin-only detail; null for client viewers. */
	batchNumber: string | null;
	reference: string | null;
};

export type RequisitionBilling = {
	invoices: RequisitionBillingInvoice[];
	payments: RequisitionPaymentRow[];
	summary: {
		totalBilled: number;
		totalPaid: number;
		outstanding: number;
		/** Perm placement filled (PAYMENT_REQUIRED) with no live invoice. */
		unbilled: boolean;
	};
};

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

/**
 * Invoices + payment history for one requisition, for the Billing tab.
 *
 * `clientId` scopes the result for client viewers: only that client's invoices,
 * no voids, only settled paper transactions, and no admin-only references.
 * Callers must have already authorised access to the requisition — this is the
 * second wall, not the first.
 *
 * Stripe payments are read live (we don't store them locally). Perm reqs carry
 * one or two invoices, so the per-invoice calls are fine; the helper never throws.
 */
export async function getRequisitionBilling(
	requisition: { id: number; status: string | null; permanentPosition: boolean | null },
	{ clientId }: { clientId?: string } = {}
): Promise<RequisitionBilling> {
	const isClientView = clientId !== undefined;

	const rows = await getInvoicesByRequisitionId(requisition.id);
	const invoices: RequisitionBillingInvoice[] = rows
		.map((r) => r.invoice)
		.filter((inv) => visibleToViewer(inv, clientId))
		.map((inv) => ({
			id: inv.id,
			invoiceNumber: inv.invoiceNumber,
			status: inv.status,
			invoiceType: inv.invoiceType === 'PAPER' ? 'PAPER' : 'STRIPE',
			total: num(inv.total),
			amountPaid: num(inv.amountPaid),
			amountRemaining: num(inv.amountRemaining),
			dueDate: inv.dueDate ?? null,
			paidAt: inv.paidAt ?? null,
			createdAt: inv.createdAt,
			stripeHostedUrl: inv.stripeHostedUrl ?? null,
			stripePdfUrl: inv.stripePdfUrl ?? null
		}));

	const byId = new Map(invoices.map((i) => [i.id, i]));
	const payments: RequisitionPaymentRow[] = [];

	const paperIds = invoices.filter((i) => i.invoiceType === 'PAPER').map((i) => i.id);
	if (paperIds.length > 0) {
		try {
			const txns = await db
				.select()
				.from(paperInvoiceTransactionTable)
				.where(inArray(paperInvoiceTransactionTable.invoiceId, paperIds))
				.orderBy(asc(paperInvoiceTransactionTable.createdAt));
			for (const t of txns) {
				if (isClientView && t.status !== 'SUCCESSFUL') continue;
				const inv = byId.get(t.invoiceId);
				if (!inv) continue;
				payments.push({
					id: t.id,
					invoiceId: inv.id,
					invoiceNumber: inv.invoiceNumber,
					date: t.createdAt,
					amount: num(t.amount),
					method: 'PAPER',
					type: t.transactionType ?? 'PAYMENT',
					status: t.status,
					batchNumber: isClientView ? null : (t.batchNumber ?? null),
					reference: null
				});
			}
		} catch (err) {
			logger.error('failed to load paper transactions for requisition', {
				error: err,
				requisitionId: requisition.id
			});
		}
	}

	const stripeRows = rows
		.map((r) => r.invoice)
		.filter((inv) => byId.has(inv.id) && inv.invoiceType !== 'PAPER' && inv.stripeInvoiceId);
	const stripeResults = await Promise.all(
		stripeRows.map(async (inv) => ({
			inv: byId.get(inv.id)!,
			payments: await getStripeInvoicePayments(inv.stripeInvoiceId!)
		}))
	);
	for (const { inv, payments: sp } of stripeResults) {
		for (const p of sp) {
			payments.push({
				id: p.id,
				invoiceId: inv.id,
				invoiceNumber: inv.invoiceNumber,
				date: p.paidAt,
				amount: p.amount,
				method: 'STRIPE',
				type: 'PAYMENT',
				status: p.status,
				batchNumber: null,
				reference: isClientView ? null : p.reference
			});
		}
	}

	payments.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

	return { invoices, payments, summary: summarizeBilling(invoices, requisition) };
}
