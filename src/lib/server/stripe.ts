import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import { logger } from '$lib/server/logger';
dotenv.config();
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe added `quantity_decimal` (fractional invoice-item quantities) in API
// version 2026-03-25.dahlia. The installed SDK pins an older version, so we set
// this version PER REQUEST on the invoice-item create calls only — every other
// Stripe call (webhooks, checkout, portal, subscriptions) stays on the pinned
// version. This lets hours bill as `quantity_decimal × unit_amount` (e.g.
// 37.5 × $40) instead of a single lump line, matching the paper invoice.
const DECIMAL_QTY_API_VERSION = '2026-03-25.dahlia';

// `quantity_decimal` isn't in the installed SDK's param types yet — extend them.
type InvoiceItemCreateParamsWithDecimalQty = Stripe.InvoiceItemCreateParams & {
	quantity_decimal?: string;
};

export async function createStripeInvoice(
	stripeCustomerId: string,
	lineItems: Array<{
		amountInCents: number;
		description?: string;
		currency?: string;
		quantity?: number;
		unitAmountInCents?: number;
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
			// Hours lines carry quantity (possibly fractional) + the per-hour rate:
			// bill as quantity_decimal × unit_amount so Stripe shows "37.5 × $40"
			// like the paper invoice. Requires the newer API version, set per call.
			if (item.quantity != null && item.unitAmountInCents != null) {
				// Clamp the quantity to 2 decimals so it never exceeds Stripe's
				// quantity_decimal precision limit (hours are already rounded upstream;
				// this is belt-and-suspenders).
				const params: InvoiceItemCreateParamsWithDecimalQty = {
					invoice: invoice.id,
					customer: stripeCustomerId,
					// On the 2026-03-25.dahlia API version, invoice items use
					// unit_amount_decimal (string cents) — `unit_amount` is rejected as
					// unknown. Pairs with quantity_decimal for exact fractional-hour totals.
					unit_amount_decimal: String(item.unitAmountInCents),
					quantity_decimal: String(Number(item.quantity.toFixed(2))),
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				};
				try {
					await stripe.invoiceItems.create(params, { apiVersion: DECIMAL_QTY_API_VERSION });
				} catch (decimalErr) {
					// Never let the decimal-quantity path hard-fail invoice creation (which
					// would revert timesheet approval). On ANY error — precision, a
					// non-integer-cent result, or an account not enabled for the dahlia API
					// version — fall back to the exact pre-computed integer amount as a lump
					// line. Loses the "qty × rate" display for this line; total stays exact.
					console.warn('decimal invoice-item failed; falling back to lump amount', {
						error: decimalErr,
						description: item.description
					});
					await stripe.invoiceItems.create({
						invoice: invoice.id,
						customer: stripeCustomerId,
						amount: item.amountInCents,
						currency: item.currency || 'usd',
						description: item.description || 'Service'
					});
				}
			} else if (item.quantity != null && item.quantity > 1) {
				// Legacy safety net: a caller passed quantity but no explicit unit
				// rate — derive the unit from the total (integer quantity only).
				await stripe.invoiceItems.create({
					invoice: invoice.id,
					customer: stripeCustomerId,
					unit_amount: Math.round(item.amountInCents / item.quantity),
					quantity: item.quantity,
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				});
			} else {
				// Single-unit charges (expenses, admin fee): one lump amount.
				await stripe.invoiceItems.create({
					invoice: invoice.id,
					customer: stripeCustomerId,
					amount: item.amountInCents,
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				});
			}
		}

		stage = 'finalize_invoice';
		const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

		stage = 'send_invoice';
		const customer = await stripe.customers.retrieve(stripeCustomerId);
		if (!('email' in customer) || !customer.email) {
			throw new Error('Stripe customer has no email — cannot send invoice');
		}
		await stripe.invoices.sendInvoice(finalizedInvoice.id);

		console.log('stripe_invoice_created', {
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
		console.error('createStripeInvoice failed', {
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

// Stripe's Invoice Payments API (`/v1/invoice_payments`) — each `invoice_payment`
// is one payment applied to an invoice, so it's the equivalent of our paper
// transaction ledger and the source for a partial-payment history. It's only
// available on recent API versions; pin one per request (same override trick as
// the invoice-item calls above) since the installed SDK's default is older and
// has no typed `invoicePayments` resource, so we call it via `stripe.rawRequest`.
const INVOICE_PAYMENTS_API_VERSION = '2026-03-25.dahlia';

// Minimal shape of the `invoice_payment` list objects we read — the SDK (17.6.0)
// predates the typed resource, so we describe just the fields we consume.
type StripeInvoicePaymentRaw = {
	id: string;
	status: 'open' | 'paid' | 'canceled';
	amount_paid: number | null;
	amount_requested: number;
	currency: string;
	is_default: boolean;
	created: number;
	status_transitions?: { paid_at: number | null; canceled_at: number | null };
	payment?: {
		type: 'payment_intent' | 'charge' | 'payment_record';
		payment_intent?: string | null;
		charge?: string | null;
		payment_record?: string | null;
	};
};

export type StripeInvoicePaymentView = {
	id: string;
	amount: number; // dollars
	status: string;
	paidAt: Date;
	reference: string | null; // underlying payment_intent / charge id
};

/**
 * Read-through of a Stripe invoice's individual payments — the equivalent of the
 * paper-invoice transaction ledger, used to show a partial-payment history.
 * Returns only settled ('paid') payments in chronological order; the auto-created
 * default InvoicePayment that just tracks the open balance is filtered out. Never
 * throws — logs and returns [] on error so the invoice page still renders.
 * (Failed attempts are surfaced separately via the invoice's persisted
 * attempted/attemptCount, written by the invoice.payment_failed webhook — the
 * invoice_payments ledger does not reliably list failed attempts.)
 */
export async function getStripeInvoicePayments(
	stripeInvoiceId: string
): Promise<StripeInvoicePaymentView[]> {
	if (!stripeInvoiceId) return [];
	try {
		// rawRequest only accepts a params object on POST — for GET the query must
		// live in the path, so build the querystring inline and pass no params.
		const query = new URLSearchParams({ invoice: stripeInvoiceId, limit: '100' }).toString();
		const res = (await stripe.rawRequest('GET', `/v1/invoice_payments?${query}`, undefined, {
			apiVersion: INVOICE_PAYMENTS_API_VERSION
		})) as unknown as { data?: StripeInvoicePaymentRaw[] };

		return (res?.data ?? [])
			.filter((p) => p.status === 'paid')
			.map((p) => ({
				id: p.id,
				amount: (p.amount_paid ?? 0) / 100,
				status: p.status,
				paidAt: new Date((p.status_transitions?.paid_at ?? p.created) * 1000),
				reference: p.payment?.payment_intent ?? p.payment?.charge ?? null
			}))
			.sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
	} catch (err) {
		logger.error('failed to load stripe invoice payments', { error: err, stripeInvoiceId });
		return [];
	}
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
		// Verify the stored pointer still resolves in THIS Stripe account/mode.
		// A stale id — created under a different key/mode (test vs live) or deleted
		// in the dashboard — would otherwise blow up downstream calls like
		// createSetupCheckoutSession with "No such customer", and the client could
		// never complete setup. If it's gone, fall through and create a fresh
		// customer; the caller persists the returned id back to our DB.
		try {
			const existing = await stripe.customers.retrieve(opts.existingCustomerId);
			if (!existing.deleted) {
				return opts.existingCustomerId;
			}
			console.warn?.('ensureStripeCustomer: stored customer is deleted in Stripe — recreating', {
				stripe_customer_id: opts.existingCustomerId,
				clientId: opts.clientId
			});
		} catch (err) {
			const stripeErr = err as Stripe.errors.StripeError;
			if (stripeErr?.code !== 'resource_missing') {
				// A real Stripe/transport error (auth, network, rate limit) — don't
				// mask it by creating a duplicate customer.
				throw err;
			}
			console.warn?.('ensureStripeCustomer: stored customer not found in Stripe — recreating', {
				stripe_customer_id: opts.existingCustomerId,
				clientId: opts.clientId
			});
		}
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
		console.warn?.('customerHasDefaultPaymentMethod lookup failed', {
			error: err,
			stripe_customer_id: customerId
		});
		return false;
	}
}

/**
 * The type of the customer's default payment method ('card', 'us_bank_account',
 * …), or null if none / on error. Used to add a card-processing surcharge to
 * generated invoices only when the client pays by card. Lenient on failure so a
 * Stripe hiccup never blocks invoice generation (returns null → no surcharge).
 */
export async function getDefaultPaymentMethodType(customerId: string): Promise<string | null> {
	try {
		const customer = await stripe.customers.retrieve(customerId, {
			expand: ['invoice_settings.default_payment_method']
		});
		if (customer.deleted) return null;
		const pm = customer.invoice_settings?.default_payment_method;
		// Expanded → a PaymentMethod object with `.type`; unexpanded would be a string id.
		return pm && typeof pm !== 'string' ? (pm.type ?? null) : null;
	} catch (err) {
		console.warn?.('getDefaultPaymentMethodType lookup failed', {
			error: err,
			stripe_customer_id: customerId
		});
		return null;
	}
}

export const PROCESSING_FEE_LINE_DESCRIPTION = 'Processing Fee (3%)';
// Card-payment surcharge to offset Stripe card processing fees: a flat 3% of the
// summed line-item total.
export const CARD_PROCESSING_FEE_RATE = 0.03;

/** cents = round(base × 3%) */
export function computeCardProcessingFeeCents(baseCents: number): number {
	return Math.round(baseCents * CARD_PROCESSING_FEE_RATE);
}

type StripeInvoiceLineItemInput = {
	amountInCents: number;
	description?: string;
	currency?: string;
	quantity?: number;
	unitAmountInCents?: number;
};

/**
 * Append a "Processing Fee" line item when the customer's default payment method
 * is a card — a flat 3% of the summed line-item total. Returns the list
 * unchanged for ACH/bank or unknown methods. Applied to EVERY Stripe invoice we
 * generate (timesheet + one-off) so card-paid clients cover the processing cost.
 */
export async function withCardProcessingFee(
	stripeCustomerId: string,
	lineItems: StripeInvoiceLineItemInput[]
): Promise<StripeInvoiceLineItemInput[]> {
	const type = await getDefaultPaymentMethodType(stripeCustomerId);
	if (type !== 'card') return lineItems;
	const base = lineItems.reduce((sum, li) => sum + (li.amountInCents || 0), 0);
	if (base <= 0) return lineItems;
	return [
		...lineItems,
		{
			amountInCents: computeCardProcessingFeeCents(base),
			description: PROCESSING_FEE_LINE_DESCRIPTION,
			currency: 'usd'
		}
	];
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
