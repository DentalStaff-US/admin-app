import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { clientProfileTable } from '$lib/server/database/schemas/client';

/**
 * The practice's `client_invoice_method`, so the approve confirmation can say
 * which kind of invoice approval creates. PAPER silently overrides a live
 * Stripe customer (approveAndInvoiceTimesheet reads the same column).
 * Read-only; null when the client row is missing.
 */
export async function getClientInvoiceMethod(clientId: string | null | undefined): Promise<'PAPER' | 'STRIPE' | null> {
	if (!clientId) return null;
	const [row] = await db
		.select({ method: clientProfileTable.clientInvoiceMethod })
		.from(clientProfileTable)
		.where(eq(clientProfileTable.id, clientId))
		.limit(1);
	return row ? (row.method ?? 'STRIPE') : null;
}
