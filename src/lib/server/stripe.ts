import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { logger } from '$lib/server/logger';
dotenv.config();
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createStripeInvoice(
	stripeCustomerId: string,
	lineItems: Array<{
		amountInCents: number;
		description?: string;
		currency?: string;
		quantity?: number;
	}>,
	metadata: Stripe.MetadataParam = {},
	additionalNotes?: string,
	dueDate?: Date | string
): Promise<Stripe.Invoice> {
	if (!stripeCustomerId) {
		throw new Error('Stripe customer ID is required');
	}

	let stage: 'create_invoice' | 'create_invoice_items' | 'finalize_invoice' | 'send_invoice' =
		'create_invoice';
	let invoiceId: string | undefined;

	try {
		// Convert dueDate to Unix timestamp. Stripe rejects any timestamp that
		// isn't strictly in the future, so we clamp anything within the next 5
		// minutes (or already past) back to `undefined` and let the existing
		// `days_until_due: 1` fallback below take over. This protects against
		// caller mistakes (e.g. parsing a `YYYY-MM-DD` string at UTC midnight
		// while the admin is several hours west of UTC), clock skew, and DST
		// edge cases — without silently moving the due date far away from what
		// the user asked for.
		let dueDateTimestamp: number | undefined;
		if (dueDate) {
			const date = new Date(dueDate);
			const candidate = Math.floor(date.getTime() / 1000);
			const minimum = Math.floor(Date.now() / 1000) + 5 * 60;
			dueDateTimestamp = candidate > minimum ? candidate : undefined;
		}

		const invoice = await stripe.invoices.create({
			customer: stripeCustomerId,
			collection_method: 'send_invoice',
			due_date: dueDateTimestamp,
			days_until_due: dueDateTimestamp ? undefined : 1,
			auto_advance: false,
			metadata,
			description: additionalNotes || 'Invoice for services rendered'
		});
		invoiceId = invoice.id;

		stage = 'create_invoice_items';
		for (const item of lineItems) {
			let invoiceItemParams;

			if (item.quantity && item.quantity > 1) {
				const unitAmount = Math.round(item.amountInCents / item.quantity);
				invoiceItemParams = {
					invoice: invoice.id,
					customer: stripeCustomerId,
					unit_amount: unitAmount,
					quantity: item.quantity,
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				};
			} else {
				invoiceItemParams = {
					invoice: invoice.id,
					customer: stripeCustomerId,
					amount: item.amountInCents,
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				};
			}

			await stripe.invoiceItems.create(invoiceItemParams);
		}

		stage = 'finalize_invoice';
		const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

		stage = 'send_invoice';
		const customer = await stripe.customers.retrieve(stripeCustomerId);
		if (!('email' in customer) || !customer.email) {
			throw new Error('Stripe customer has no email — cannot send invoice');
		}
		await stripe.invoices.sendInvoice(finalizedInvoice.id);

		logger.event('stripe_invoice_created', {
			stripe_invoice_id: finalizedInvoice.id,
			stripe_customer_id: stripeCustomerId,
			amount_due: finalizedInvoice.amount_due / 100,
			currency: finalizedInvoice.currency,
			line_item_count: lineItems.length,
			metadata
		});

		return finalizedInvoice;
	} catch (error) {
		const stripeError = error as Stripe.errors.StripeError;
		logger.error('createStripeInvoice failed', {
			error,
			stage,
			stripe_invoice_id: invoiceId,
			stripe_customer_id: stripeCustomerId,
			stripe_error_type: stripeError?.type,
			stripe_error_code: stripeError?.code,
			stripe_param: stripeError?.param,
			metadata
		});
		throw error;
	}
}

/**
 * Voids a finalized Stripe invoice so the client can no longer pay it. Stripe
 * rejects voiding an already-`paid` (or draft) invoice — that error propagates
 * to the caller, which blocks the void. Our `invoice.voided` webhook syncs the
 * DB `status` to `void`, so we don't write the status here.
 */
export async function voidStripeInvoice(stripeInvoiceId: string): Promise<Stripe.Invoice> {
	if (!stripeInvoiceId) {
		throw new Error('Stripe invoice ID is required');
	}

	const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
	if (invoice.status === 'void' || invoice.status === 'uncollectible') {
		throw new Error('Stripe invoice is already voided');
	}
	if (invoice.status === 'paid') {
		throw new Error('Stripe invoice is already paid — a refund is required, not a void');
	}

	return stripe.invoices.voidInvoice(stripeInvoiceId);
}

/**
 * Idempotent: returns the existing Stripe customer if one is already linked,
 * else creates one with our standard metadata (clientId + userId) and returns
 * the new id. Single place that ever issues `stripe.customers.create` for a
 * client — both setup endpoints route through here, so the metadata shape
 * stays consistent (the webhook + reconcile path both read these fields).
 */
export async function ensureStripeCustomer(opts: {
	clientId: string;
	userId: string;
	email: string;
	name?: string;
	existingCustomerId?: string | null;
}): Promise<string> {
	if (opts.existingCustomerId) {
		// Trust our DB pointer. If Stripe later 404s on this id, the caller
		// will surface that error; we don't speculatively `retrieve` here to
		// keep this hot path cheap.
		return opts.existingCustomerId;
	}
	const customer = await stripe.customers.create({
		email: opts.email,
		name: opts.name,
		metadata: {
			clientId: opts.clientId,
			userId: opts.userId
		}
	});
	return customer.id;
}

/**
 * Truth check against Stripe. Used by the reconcile path before generating a
 * fresh Checkout — if the customer already has a default payment method we
 * skip Checkout entirely and just sync our DB. Returns `false` for any
 * lookup error (lenient) so a Stripe outage doesn't block setup attempts.
 */
export async function customerHasDefaultPaymentMethod(customerId: string): Promise<boolean> {
	try {
		const customer = await stripe.customers.retrieve(customerId);
		if (customer.deleted) return false;
		const defaultPm = customer.invoice_settings?.default_payment_method;
		return defaultPm != null;
	} catch (err) {
		logger.warn?.('customerHasDefaultPaymentMethod lookup failed', {
			error: err,
			stripe_customer_id: customerId
		});
		return false;
	}
}

/**
 * Wraps `stripe.checkout.sessions.create` in setup mode with our standard
 * metadata (clientId + userId), so the webhook (`checkout.session.completed`
 * → `handleCustomerSetupCompleted`) can locate the right `client_subscriptions`
 * row when the candidate finishes Checkout.
 */
export async function createSetupCheckoutSession(opts: {
	customerId: string;
	clientId: string;
	userId: string;
	successUrl: string;
	cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
	const session = await stripe.checkout.sessions.create({
		mode: 'setup',
		customer: opts.customerId,
		payment_method_types: ['card', 'us_bank_account'],
		success_url: opts.successUrl,
		cancel_url: opts.cancelUrl,
		metadata: {
			clientId: opts.clientId,
			userId: opts.userId
		}
	});
	if (!session.url) {
		throw new Error('Stripe Checkout session created with no url');
	}
	return { url: session.url, sessionId: session.id };
}
