import { redirect, error, type RequestHandler } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { getInvoiceByIdAdmin, getInvoiceById } from '$lib/server/database/queries/requisitions';
import type { InvoiceWithRelations } from '$lib/server/database/schemas/requisition';
import { getClientProfilebyUserId } from '$lib/server/database/queries/clients';
import { generateAndStoreInvoicePdf } from '$lib/server/invoices/generateInvoicePdf';

// Authorized paper-invoice PDF download. Admins can fetch any invoice; a client
// can only fetch their own (getInvoiceById is scoped by clientId and returns
// null otherwise). Generates/stores the PDF as a private object and redirects to
// a short-lived signed URL — the object is never publicly reachable.
export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');

	const id = event.params.id as string;

	let invoice: InvoiceWithRelations | null = null;
	if (user.role === USER_ROLES.SUPERADMIN) {
		invoice = await getInvoiceByIdAdmin(id);
	} else if (user.role === USER_ROLES.CLIENT) {
		const client = await getClientProfilebyUserId(user.id);
		invoice = await getInvoiceById(id, client.id);
	} else {
		error(403, 'Not authorized to view this invoice');
	}

	if (!invoice) error(404, 'Invoice not found');

	if (invoice.invoice.invoiceType !== 'PAPER') {
		// Stripe invoices already have their own hosted PDF.
		if (invoice.invoice.stripePdfUrl) redirect(302, invoice.invoice.stripePdfUrl);
		error(400, 'No downloadable PDF for this invoice');
	}

	const signedUrl = await generateAndStoreInvoicePdf(invoice);
	redirect(302, signedUrl);
};
