import { eq, asc } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { invoiceTable, type InvoiceWithRelations } from '$lib/server/database/schemas/requisition';
import { userTable } from '$lib/server/database/schemas/auth';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { uploadPrivateFile, getSignedDownloadUrl } from '$lib/server/uploads';
import { getInvoiceSender } from './senderConfig';
import { renderInvoicePdf, type InvoicePdfContext, type InvoicePdfLineItem } from './pdf';

const toNum = (v: unknown, fallback = 0) => {
	const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
	return Number.isFinite(n) ? n : fallback;
};

/**
 * Contact email + billing address that the shared invoice query doesn't return
 * (it only selects the client user's name). Kept isolated so existing invoice
 * display is untouched. Address comes from the company's first office location.
 */
async function getInvoiceBillingExtras(clientUserId: string | null, companyId: string | null) {
	let email: string | null = null;
	if (clientUserId) {
		const [u] = await db
			.select({ email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, clientUserId))
			.limit(1);
		email = u?.email ?? null;
	}

	let phone: string | null = null;
	const addressLines: string[] = [];
	if (companyId) {
		const [loc] = await db
			.select({
				streetOne: companyOfficeLocationTable.streetOne,
				streetTwo: companyOfficeLocationTable.streetTwo,
				city: companyOfficeLocationTable.city,
				state: companyOfficeLocationTable.state,
				zipcode: companyOfficeLocationTable.zipcode,
				companyPhone: companyOfficeLocationTable.companyPhone,
				cellPhone: companyOfficeLocationTable.cellPhone
			})
			.from(companyOfficeLocationTable)
			.where(eq(companyOfficeLocationTable.companyId, companyId))
			.orderBy(asc(companyOfficeLocationTable.createdAt))
			.limit(1);
		if (loc) {
			const street = [loc.streetOne, loc.streetTwo].filter(Boolean).join(', ');
			const cityLine = [loc.city, [loc.state, loc.zipcode].filter(Boolean).join(' ').trim()]
				.filter(Boolean)
				.join(', ');
			if (street) addressLines.push(street);
			if (cityLine) addressLines.push(cityLine);
			phone = loc.companyPhone || loc.cellPhone || null;
		}
	}

	return { email, phone, addressLines };
}

function buildContext(
	inv: InvoiceWithRelations,
	extras: { email: string | null; phone: string | null; addressLines: string[] }
): InvoicePdfContext {
	const i = inv.invoice;

	const lineItems: InvoicePdfLineItem[] = (inv.lineItems ?? []).map((li) => {
		const item = li as Record<string, unknown>;
		return {
			description: String(item.description ?? ''),
			quantity: toNum(item.quantity, 1),
			// Per-unit price in cents (mirrors the on-screen table's preference order).
			unitAmountCents: toNum(item.unit_amount_excluding_tax ?? item.unit_amount ?? item.rate, 0),
			amountCents: toNum(item.amount, 0)
		};
	});

	const contactName =
		[inv.clientUser?.firstName, inv.clientUser?.lastName].filter(Boolean).join(' ') ||
		i.customerName ||
		null;

	return {
		invoiceNumber: i.invoiceNumber,
		issueDate: i.createdAt,
		dueDate: i.dueDate ?? null,
		status: i.status,
		currency: i.currency,
		description: i.description ?? null,
		footer: i.footer ?? null,
		subtotal: toNum(i.subtotal),
		total: toNum(i.total),
		// What's still owed drives the headline + "Amount due" line.
		amountDue: toNum(i.amountRemaining ?? i.amountDue),
		amountPaid: toNum(i.amountPaid),
		lineItems,
		sender: getInvoiceSender(),
		billTo: {
			contactName,
			companyName: inv.company?.companyName ?? null,
			email: i.customerEmail || extras.email,
			phone: inv.client?.cellPhone || extras.phone,
			addressLines: extras.addressLines
		}
	};
}

/**
 * Render the invoice to a PDF, upload it as a PRIVATE object (same bucket as
 * docs, no public ACL), persist its key on the invoice, and return a short-lived
 * signed download URL. The object is only reachable via this signed URL — never
 * a plain public URL.
 */
export async function generateAndStoreInvoicePdf(inv: InvoiceWithRelations): Promise<string> {
	const extras = await getInvoiceBillingExtras(inv.client?.userId ?? null, inv.company?.id ?? null);
	const ctx = buildContext(inv, extras);
	const buffer = await renderInvoicePdf(ctx);

	const fileName = `${inv.invoice.invoiceNumber}.pdf`;
	const key = await uploadPrivateFile({
		file: { mimetype: 'application/pdf', fileName, buffer },
		location: `invoices/${inv.invoice.id}`
	});

	// Persist the key on the invoice the first time (deterministic key, so this is
	// a one-time write) — mirrors how Stripe invoices store their PDF reference.
	if (inv.invoice.paperInvoiceKey !== key) {
		await db
			.update(invoiceTable)
			.set({ paperInvoiceKey: key, updatedAt: new Date() })
			.where(eq(invoiceTable.id, inv.invoice.id));
	}

	return getSignedDownloadUrl(key, 900, fileName);
}
