import { message, superValidate } from 'sveltekit-superforms/server';
import { stripe, voidStripeInvoice } from '$lib/server/stripe';
import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import {
	getInvoiceById,
	getInvoiceByIdAdmin,
	getPaperTransactionsByInvoiceId,
	voidTimesheetWithInvoice
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
	notifyMiscellaneousTransaction,
	notifyInvoiceVoided
} from '$lib/server/notifications/transactional';
import { writeActionHistory } from '$lib/server/database/queries/admin';

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

const ReversePaymentSchema = z.object({
	invoiceId: z.string().min(1),
	amount: z.string().transform((val) => {
		const parsed = parseFloat(val);
		if (isNaN(parsed) || parsed <= 0) throw new Error('Amount must be a positive number');
		return parsed;
	}),
	reason: z.string().min(1, 'A reason is required')
});

const VoidInvoiceSchema = z.object({
	invoiceId: z.string().min(1),
	reason: z.string().min(1, 'A reason is required')
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
					// Clear the paid timestamp when a transaction (e.g. a REFUND) reopens
					// an invoice — `undefined` would leave the stale value in place.
					paidAt: newStatus === 'paid' ? new Date() : null,
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
	},

	// Reverse an erroneously-recorded paper payment — sends the invoice back to
	// `open`/owed. Recorded as an ADJUSTMENT ledger row (no new enum value) but with
	// reversal math (opposite direction to the generic ADJUSTMENT branch above).
	reversePaperPayment: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/auth/sign-in');

		const form = await superValidate(event, ReversePaymentSchema);
		if (!form.valid) {
			setFlash({ type: 'error', message: 'Invalid reversal data' }, event);
			return fail(400, { form });
		}

		const { invoiceId, amount, reason } = form.data;

		try {
			const [currentInvoice] = await db
				.select({
					status: invoiceTable.status,
					invoiceType: invoiceTable.invoiceType,
					amountRemaining: invoiceTable.amountRemaining,
					amountPaid: invoiceTable.amountPaid,
					paidAt: invoiceTable.paidAt
				})
				.from(invoiceTable)
				.where(eq(invoiceTable.id, invoiceId))
				.limit(1);

			if (!currentInvoice) {
				setFlash({ type: 'error', message: 'Invoice not found' }, event);
				return fail(404, { form });
			}
			if (currentInvoice.invoiceType !== 'PAPER') {
				setFlash({ type: 'error', message: 'Only paper invoices can be reversed here' }, event);
				return fail(400, { form });
			}
			if (currentInvoice.status === 'void') {
				setFlash({ type: 'error', message: 'Cannot reverse a payment on a voided invoice' }, event);
				return fail(400, { form });
			}

			const currentRemaining = parseFloat(String(currentInvoice.amountRemaining ?? 0));
			const currentPaid = parseFloat(String(currentInvoice.amountPaid ?? 0));

			if (currentPaid <= 0) {
				setFlash({ type: 'error', message: 'There is no recorded payment to reverse' }, event);
				return fail(400, { form });
			}
			if (amount > currentPaid) {
				setFlash(
					{ type: 'error', message: 'Reversal amount cannot exceed the amount paid' },
					event
				);
				return fail(400, { form });
			}

			// Reversal math: add back to what's owed, subtract from what's been paid.
			const newRemaining = currentRemaining + amount;
			const newPaid = Math.max(0, currentPaid - amount);
			const newStatus: 'open' | 'paid' = newRemaining > 0 ? 'open' : 'paid';

			await db.insert(paperInvoiceTransactionTable).values({
				id: crypto.randomUUID(),
				invoiceId,
				timesheetId: null,
				batchNumber: null,
				transactionType: 'ADJUSTMENT',
				status: 'SUCCESSFUL',
				amount: amount.toFixed(2),
				details: { notes: reason, reversal: true }
			});

			await db
				.update(invoiceTable)
				.set({
					amountRemaining: newRemaining.toFixed(2),
					amountPaid: newPaid.toFixed(2),
					status: newStatus,
					paidAt: newStatus === 'paid' ? currentInvoice.paidAt : null,
					updatedAt: new Date()
				})
				.where(eq(invoiceTable.id, invoiceId));

			await writeActionHistory({
				table: 'INVOICES',
				userId: user.id,
				action: 'UPDATE',
				entityId: invoiceId,
				beforeState: {
					status: currentInvoice.status,
					amountPaid: currentInvoice.amountPaid,
					amountRemaining: currentInvoice.amountRemaining,
					paidAt: currentInvoice.paidAt
				},
				afterState: {
					status: newStatus,
					amountPaid: newPaid.toFixed(2),
					amountRemaining: newRemaining.toFixed(2),
					paidAt: newStatus === 'paid' ? currentInvoice.paidAt : null
				},
				metadata: { operation: 'REVERSE_PAYMENT', reason, amount: amount.toFixed(2) }
			});

			await notifyMiscellaneousTransaction({
				invoiceId,
				transactionType: 'ADJUSTMENT',
				amount,
				notes: reason
			});

			setFlash({ type: 'success', message: 'Payment reversed successfully' }, event);
			return message(form, 'Payment reversed successfully');
		} catch (err) {
			console.error('Error reversing paper payment:', err);
			setFlash({ type: 'error', message: 'Failed to reverse payment' }, event);
			return fail(500, { form });
		}
	},

	// Void a paper invoice — marks it dead (mirrors Stripe void semantics: status
	// change only, no refund/balance change). Leaves the ledger as historical record.
	// Void an invoice — works for BOTH paper and Stripe, from anywhere.
	//  - Timesheet-linked: run the full cleanup (voidTimesheetWithInvoice) so the
	//    behavior is consistent no matter which direction the void starts from —
	//    it voids the invoice AND the timesheet and releases its workdays, so a
	//    fresh DRAFT regenerates for correction and re-invoicing.
	//  - One-off/manual: void the invoice only (Stripe via the API first, then DB).
	voidInvoice: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user || user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/auth/sign-in');

		const form = await superValidate(event, VoidInvoiceSchema);
		if (!form.valid) {
			setFlash({ type: 'error', message: 'A reason is required to void an invoice' }, event);
			return fail(400, { form });
		}

		const { invoiceId, reason } = form.data;

		try {
			const [currentInvoice] = await db
				.select({
					status: invoiceTable.status,
					invoiceType: invoiceTable.invoiceType,
					stripeInvoiceId: invoiceTable.stripeInvoiceId,
					timesheetId: invoiceTable.timesheetId
				})
				.from(invoiceTable)
				.where(eq(invoiceTable.id, invoiceId))
				.limit(1);

			if (!currentInvoice) {
				setFlash({ type: 'error', message: 'Invoice not found' }, event);
				return fail(404, { form });
			}
			if (currentInvoice.status === 'void') {
				setFlash({ type: 'error', message: 'Invoice is already voided' }, event);
				return fail(400, { form });
			}
			if (currentInvoice.status === 'paid') {
				setFlash(
					{ type: 'error', message: 'Invoice is already paid — a refund is required, not a void' },
					event
				);
				return fail(400, { form });
			}

			if (currentInvoice.timesheetId) {
				// Timesheet-linked: full cleanup. Voids the invoice (Stripe via the API,
				// paper directly), voids the timesheet, and detaches its workdays so the
				// processTimesheetCreation cron regenerates a fresh DRAFT for correction.
				await voidTimesheetWithInvoice(currentInvoice.timesheetId, user.id);
			} else if (currentInvoice.invoiceType === 'STRIPE' && currentInvoice.stripeInvoiceId) {
				// Standalone Stripe invoice: void in Stripe FIRST (outside the DB write)
				// so a Stripe rejection doesn't desync our DB. Throws if paid/void.
				await voidStripeInvoice(currentInvoice.stripeInvoiceId);
			}

			// Mark the invoice void immediately for every path (idempotent — the paper
			// timesheet flow already set it, and the Stripe invoice.voided webhook will
			// too). Ensures the UI reflects the void without waiting on the webhook.
			await db
				.update(invoiceTable)
				.set({
					status: 'void',
					voidedAt: new Date(),
					updatedAt: new Date()
				})
				.where(eq(invoiceTable.id, invoiceId));

			await writeActionHistory({
				table: 'INVOICES',
				userId: user.id,
				action: 'UPDATE',
				entityId: invoiceId,
				beforeState: { status: currentInvoice.status },
				afterState: { status: 'void' },
				metadata: {
					operation: 'VOID',
					reason,
					invoiceType: currentInvoice.invoiceType,
					timesheetVoided: !!currentInvoice.timesheetId
				}
			});

			await notifyInvoiceVoided(invoiceId, reason);

			setFlash({ type: 'success', message: 'Invoice voided successfully' }, event);
			return message(form, 'Invoice voided successfully');
		} catch (err) {
			console.error('Error voiding invoice:', err);
			setFlash({ type: 'error', message: 'Failed to void invoice' }, event);
			return fail(500, { form });
		}
	}
};
