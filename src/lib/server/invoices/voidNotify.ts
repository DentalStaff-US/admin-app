import { and, eq, ne } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { invoiceTable } from '$lib/server/database/schemas/requisition';
import { notifyInvoiceVoided } from '$lib/server/notifications/transactional';

/**
 * Single choke point for voiding an invoice record + notifying the client — so a
 * void surfacing from ANY path (the invoice-page action, the timesheet void flow,
 * or the Stripe `invoice.voided` webhook for dashboard-side voids) emails the
 * client exactly ONCE.
 *
 * The status flip is atomic and conditional (`WHERE status <> 'void'`): only the
 * caller that actually performs the open→void transition gets a row back and
 * sends the email; any later/concurrent caller (e.g. the webhook arriving after
 * our own action already voided) is a no-op. This is why our void actions can
 * update immediately (for snappy UI + the real admin reason) without the webhook
 * double-notifying.
 *
 * Returns true if this call performed the transition (and notified).
 */
export async function voidInvoiceAndNotify(invoiceId: string, reason: string): Promise<boolean> {
	const [flipped] = await db
		.update(invoiceTable)
		.set({ status: 'void', voidReason: reason, voidedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(invoiceTable.id, invoiceId), ne(invoiceTable.status, 'void')))
		.returning({ id: invoiceTable.id });

	if (!flipped) return false; // already void — someone else already notified

	await notifyInvoiceVoided(invoiceId, reason);
	return true;
}
