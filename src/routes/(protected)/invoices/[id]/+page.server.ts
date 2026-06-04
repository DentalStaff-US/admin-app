import { message, superValidate } from 'sveltekit-superforms/server';
import { stripe } from '$lib/server/stripe';
import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import {
	getInvoiceById,
	getInvoiceByIdAdmin,
	getPaperTransactionsByInvoiceId
} from '$lib/server/database/queries/requisitions';
import { getClientProfilebyUserId } from '$lib/server/database/queries/clients';
import { setFlash } from 'sveltekit-flash-message/server';
import { z } from 'zod';
import db from '$lib/server/database/drizzle';
import {
	invoiceTable,
	paperInvoiceTransactionTable
} from '$lib/server/database/schemas/requisition';
import { eq } from 'drizzle-orm';
import {
	notifyInvoicePaymentProcessed,
	notifyMiscellaneousTransaction
} from '$lib/server/notifications/transactional';

const RecordTransactionSchema = z.object({
	invoiceId: z.string().min(1),
	amount: z.string().transform((val) => {
		const parsed = parseFloat(val);
		if (isNaN(parsed) || parsed <= 0) throw new Error('Amount must be a positive number');
		return parsed;
	}),
	transactionType: z.enum(['PAYMENT', 'REFUND', 'ADJUSTMENT']).default('PAYMENT'),
	batchNumber: z.string().optional(),
	notes: z.string().optional()
});

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');

	if (user.role === USER_ROLES.SUPERADMIN) {
		const invoiceDetails = await getInvoiceByIdAdmin(event.params.id);
		const transactionForm = await superValidate(RecordTransactionSchema);
		const paperTransactions = await getPaperTransactionsByInvoiceId(event.params.id);
		return { user, invoice: invoiceDetails, transactionForm, paperTransactions };
	}

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) redirect(302, '/onboarding/client/company');
		const client = await getClientProfilebyUserId(user.id);
		const invoiceDetails = await getInvoiceById(event.params.id, client.id);
		const paperTransactions = await getPaperTransactionsByInvoiceId(event.params.id);
		return { user, invoice: invoiceDetails, transactionForm: null, paperTransactions };
	}

	return { user, invoice: null, transactionForm: null, paperTransactions: [] };
};

export const actions = {
	adminProcessInvoice: async (event: RequestEvent) => {
		const id = event.params.id;
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/auth/sign-in');

		const invoice = await getInvoiceByIdAdmin(id);
		if (!invoice) redirect(302, '/invoices');

		// Never attempt payment on an invoice that is voided, already paid, or
		// written off — the button is hidden for these, this is the server guard.
		const blockedStatuses = ['void', 'paid', 'uncollectible'];
		if (blockedStatuses.includes(invoice.invoice.status)) {
			setFlash(
				{ type: 'error', message: `Cannot process a ${invoice.invoice.status} invoice` },
				event
			);
			return fail(400, { error: `Invoice is ${invoice.invoice.status}` });
		}

		try {
			if (invoice.invoice.stripeInvoiceId) {
				const result = await stripe.invoices.pay(invoice.invoice.stripeInvoiceId);
				console.log('Invoice payment result:', result);
				await notifyInvoicePaymentProcessed(id);
				setFlash({ type: 'success', message: 'Invoice processed successfully' }, event);
				return { success: true };
			}
		} catch (err) {
			console.error('Error processing invoice:', err);
			setFlash({ type: 'error', message: `Failed to process invoice: ${err.raw?.message}` }, event);
		}
	},

	recordPaperTransaction: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/auth/sign-in');

		const form = await superValidate(event, RecordTransactionSchema);
		if (!form.valid) {
			setFlash({ type: 'error', message: 'Invalid transaction data' }, event);
			return { form };
		}

		const { invoiceId, amount, transactionType, batchNumber, notes } = form.data;

		try {
			// Fetch current invoice state
			const [currentInvoice] = await db
				.select({
					status: invoiceTable.status,
					amountRemaining: invoiceTable.amountRemaining,
					amountPaid: invoiceTable.amountPaid,
					total: invoiceTable.total
				})
				.from(invoiceTable)
				.where(eq(invoiceTable.id, invoiceId))
				.limit(1);

			if (!currentInvoice) {
				setFlash({ type: 'error', message: 'Invoice not found' }, event);
				return { form };
			}

			// A voided invoice is dead — no payments/refunds/adjustments may post
			// against it.
			if (currentInvoice.status === 'void') {
				setFlash(
					{ type: 'error', message: 'Cannot record a transaction on a voided invoice' },
					event
				);
				return fail(400, { form });
			}

			const currentRemaining = parseFloat(String(currentInvoice.amountRemaining ?? 0));
			const currentPaid = parseFloat(String(currentInvoice.amountPaid ?? 0));

			// Calculate new balances based on transaction type
			let newRemaining: number;
			let newPaid: number;
			let newStatus: 'open' | 'paid' = 'open';

			if (transactionType === 'PAYMENT') {
				newRemaining = Math.max(0, currentRemaining - amount);
				newPaid = currentPaid + amount;
			} else if (transactionType === 'REFUND') {
				newRemaining = currentRemaining + amount;
				newPaid = Math.max(0, currentPaid - amount);
			} else {
				// ADJUSTMENT
				newRemaining = Math.max(0, currentRemaining - amount);
				newPaid = currentPaid + amount;
			}

			if (newRemaining <= 0) newStatus = 'paid';

			// Write transaction record
			await db.insert(paperInvoiceTransactionTable).values({
				id: crypto.randomUUID(),
				invoiceId,
				timesheetId: null,
				batchNumber: batchNumber || null,
				transactionType,
				status: 'SUCCESSFUL',
				amount: amount.toFixed(2),
				details: notes ? { notes } : null
			});

			// Update invoice balances and status
			await db
				.update(invoiceTable)
				.set({
					amountRemaining: newRemaining.toFixed(2),
					amountPaid: newPaid.toFixed(2),
					status: newStatus,
					paidAt: newStatus === 'paid' ? new Date() : undefined,
					updatedAt: new Date()
				})
				.where(eq(invoiceTable.id, invoiceId));

			await notifyMiscellaneousTransaction({
				invoiceId,
				transactionType,
				amount,
				notes: notes ?? null
			});

			setFlash({ type: 'success', message: 'Transaction recorded successfully' }, event);
			return message(form, 'Transaction recorded successfully');
		} catch (err) {
			console.error('Error recording paper transaction:', err);
			setFlash({ type: 'error', message: 'Failed to record transaction' }, event);
			return { form };
		}
	}
};
