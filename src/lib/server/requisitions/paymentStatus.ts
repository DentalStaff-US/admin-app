import { and, eq, ne } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { invoiceTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { logger } from '$lib/server/logger';
import { decidePaymentStatus } from '$lib/server/requisitions/paymentStatusRule';

/**
 * Keeps a permanent requisition's payment status in step with its invoices.
 *
 * Approving an application on a perm requisition sets it to PAYMENT_REQUIRED
 * (see `approveRequisitionApplication`), but until this existed nothing ever took
 * it back off: the only writer of PAYMENT_RECEIVED was the admin's "Update status"
 * dropdown. A placement could be invoiced and fully paid months earlier and still
 * read "Payment Required" to everyone looking at it.
 *
 * Single gate for that transition, in the same spirit as `voidInvoiceAndNotify`
 * for voids — every path that can settle or reopen an invoice calls this, so the
 * rule lives in one place:
 *
 *   - every non-void invoice settled  → PAYMENT_REQUIRED  → PAYMENT_RECEIVED
 *   - any balance reopened (a refund) → PAYMENT_RECEIVED  → PAYMENT_REQUIRED
 *
 * A requisition with no invoices at all is left alone: nothing has been billed, so
 * PAYMENT_REQUIRED is still the truth.
 *
 * Never throws. Callers are payment actions and the Stripe webhook, where a
 * bookkeeping failure must not fail the payment or trigger endless Stripe retries.
 */
export async function syncRequisitionPaymentStatus(
	requisitionId: number | null | undefined,
	actorUserId: string | null
): Promise<{ changed: boolean; from?: string; to?: string }> {
	if (requisitionId == null) return { changed: false };

	try {
		const [requisition] = await db
			.select()
			.from(requisitionTable)
			.where(eq(requisitionTable.id, requisitionId))
			.limit(1);

		// Only the perm payment-tracking branch is ours to move. Any other status
		// (OPEN, CLOSED, CANCELED…) is someone else's state machine.
		if (
			!requisition ||
			(requisition.status !== 'PAYMENT_REQUIRED' && requisition.status !== 'PAYMENT_RECEIVED')
		) {
			return { changed: false };
		}

		const invoices = await db
			.select({
				id: invoiceTable.id,
				status: invoiceTable.status,
				amountRemaining: invoiceTable.amountRemaining
			})
			.from(invoiceTable)
			.where(and(eq(invoiceTable.requisitionId, requisitionId), ne(invoiceTable.status, 'void')));

		const nextStatus = decidePaymentStatus(invoices);
		if (nextStatus === null || nextStatus === requisition.status) return { changed: false };

		const [updated] = await db
			.update(requisitionTable)
			.set({ status: nextStatus })
			.where(eq(requisitionTable.id, requisitionId))
			.returning();

		await writeActionHistory({
			table: 'REQUISITIONS',
			userId: actorUserId,
			action: 'STATUS_CHANGE',
			entityId: String(requisitionId),
			beforeState: requisition,
			afterState: updated,
			metadata: {
				from: requisition.status,
				to: nextStatus,
				trigger: 'INVOICE_PAYMENT_SYNC',
				invoiceCount: invoices.length
			}
		});

		return { changed: true, from: requisition.status, to: nextStatus };
	} catch (err) {
		logger.error('syncRequisitionPaymentStatus failed', { error: err, requisitionId });
		return { changed: false };
	}
}
