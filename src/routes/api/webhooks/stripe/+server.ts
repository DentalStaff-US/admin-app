import { invoiceTable } from './../../../../lib/server/database/schemas/requisition';
import { stripe } from '$lib/server/stripe';
import { json } from '@sveltejs/kit';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import type { RequestHandler } from './$types';
import {
	getClientProfileById,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import {
	handleCheckoutCompleted,
	handleCustomerSetupCompleted,
	handleSubscriptionCreated,
	handleSubscriptionDeleted,
	handleSubscriptionUpdated
} from '$lib/server/database/queries/billing';
import type Stripe from 'stripe';
import db from '$lib/server/database/drizzle';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		logger.warn('stripe webhook missing signature header');
		return new Response('No stripe signature', { status: 400 });
	}

	// Step 1: verify signature. A failure here is a 400 — Stripe will not retry.
	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		logger.error('stripe webhook signature verification failed', { error: err });
		return new Response(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown Error'}`, {
			status: 400
		});
	}

	// Step 2: dispatch handlers. A failure here is a 500 so Stripe retries.
	try {
		switch (event.type) {
			case 'checkout.session.completed': {
				const session = event.data.object as Stripe.Checkout.Session;
				if (session.mode === 'setup') {
					await handleCustomerSetupCompleted(session);
				} else {
					await handleCheckoutCompleted(session);
				}
				break;
			}

			case 'customer.subscription.created': {
				const newSubscription = event.data.object as Stripe.Subscription;
				await handleSubscriptionCreated(newSubscription);
				logger.event('subscription_created', {
					distinctId: newSubscription.metadata?.userId ?? String(newSubscription.customer),
					stripe_subscription_id: newSubscription.id,
					plan: newSubscription.items.data[0]?.price?.id ?? null,
					status: newSubscription.status
				});
				break;
			}

			case 'customer.subscription.updated':
				await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
				break;

			case 'customer.subscription.deleted': {
				const deletedSubscription = event.data.object as Stripe.Subscription;
				await handleSubscriptionDeleted(deletedSubscription);
				await db
					.delete(clientSubscriptionTable)
					.where(
						eq(clientSubscriptionTable.stripeCustomerId, deletedSubscription.customer as string)
					);
				logger.event('subscription_cancelled', {
					distinctId: deletedSubscription.metadata?.userId ?? String(deletedSubscription.customer),
					stripe_subscription_id: deletedSubscription.id,
					status: deletedSubscription.status
				});
				break;
			}

			case 'invoice.created':
				break;

			case 'invoice.updated': {
				const invoiceUpdated = event.data.object as Stripe.Invoice;
				const [existingInvoice] = await db
					.select()
					.from(invoiceTable)
					.where(eq(invoiceTable.stripeInvoiceId, invoiceUpdated.id))
					.limit(1);
				if (existingInvoice) {
					await db
						.update(invoiceTable)
						.set({
							status: invoiceUpdated.status as 'paid' | 'open' | 'draft' | 'void' | 'uncollectible',
							stripeStatus: invoiceUpdated.status,
							amountDue: (invoiceUpdated.amount_due / 100).toFixed(2),
							amountPaid: (invoiceUpdated.amount_paid / 100).toFixed(2),
							amountRemaining: (invoiceUpdated.amount_remaining / 100).toFixed(2),
							updatedAt: new Date()
						})
						.where(eq(invoiceTable.id, existingInvoice.id));
				}
				break;
			}

			case 'invoice.finalized': {
				const invoiceFinalized = event.data.object as Stripe.Invoice;
				const userId = invoiceFinalized.metadata?.userId;
				const clientId = invoiceFinalized.metadata?.clientId;

				if (!userId && !clientId) {
					logger.error('stripe invoice.finalized missing metadata', {
						stripe_invoice_id: invoiceFinalized.id,
						reason: 'no userId or clientId in metadata'
					});
					break;
				}

				const client = userId
					? await getClientProfilebyUserId(userId)
					: clientId
						? await getClientProfileById(clientId)
						: null;

				if (!client) {
					// Never return non-2xx here — Stripe would retry forever.
					logger.error('stripe invoice.finalized client not found', {
						stripe_invoice_id: invoiceFinalized.id,
						userId,
						clientId
					});
					break;
				}
				break;
			}

			case 'invoice.payment_failed': {
				const invoicePaymentFailed = event.data.object as Stripe.Invoice;
				logger.event('invoice_payment_failed', {
					distinctId:
						invoicePaymentFailed.metadata?.userId ?? String(invoicePaymentFailed.customer),
					stripe_invoice_id: invoicePaymentFailed.id,
					amount_due: invoicePaymentFailed.amount_due / 100,
					currency: invoicePaymentFailed.currency,
					attempt_count: invoicePaymentFailed.attempt_count
				});
				break;
			}

			case 'invoice.payment_succeeded': {
				// we need to record transactions the same way we do with paper, so we have a paper trail of 1 full payment or n payments until its completed.
				const invoicePaymentSucceeded = event.data.object as Stripe.Invoice;
				const [existingPaidInvoice] = await db
					.select()
					.from(invoiceTable)
					.where(eq(invoiceTable.stripeInvoiceId, invoicePaymentSucceeded.id))
					.limit(1);
				if (existingPaidInvoice) {
					await db
						.update(invoiceTable)
						.set({
							status: invoicePaymentSucceeded.status || 'open',
							stripeStatus: invoicePaymentSucceeded.status,
							paidAt: new Date(),
							amountDue: (invoicePaymentSucceeded.amount_due / 100).toFixed(2),
							amountPaid: (invoicePaymentSucceeded.amount_paid / 100).toFixed(2),
							amountRemaining: (invoicePaymentSucceeded.amount_remaining / 100).toFixed(2)
						})
						.where(eq(invoiceTable.id, existingPaidInvoice.id));
					logger.event('invoice_payment_succeeded', {
						distinctId:
							invoicePaymentSucceeded.metadata?.userId ?? String(invoicePaymentSucceeded.customer),
						stripe_invoice_id: invoicePaymentSucceeded.id,
						amount_paid: invoicePaymentSucceeded.amount_paid / 100,
						currency: invoicePaymentSucceeded.currency,
						invoice_id: existingPaidInvoice.id
					});
				}
				break;
			}

			case 'invoice.voided': {
				const invoiceVoided = event.data.object as Stripe.Invoice;
				const [existingVoidedInvoice] = await db
					.select()
					.from(invoiceTable)
					.where(eq(invoiceTable.stripeInvoiceId, invoiceVoided.id))
					.limit(1);
				if (existingVoidedInvoice) {
					await db
						.update(invoiceTable)
						.set({
							status: 'void',
							stripeStatus: invoiceVoided.status
						})
						.where(eq(invoiceTable.id, existingVoidedInvoice.id));
				}
				break;
			}
		}

		return json({ received: true });
	} catch (err) {
		logger.error('stripe webhook handler failed', {
			error: err,
			stripe_event_type: event.type,
			stripe_event_id: event.id
		});
		// Return 500 so Stripe retries — handler failures are usually transient
		// (DB unavailable, etc.). Signature failures already returned 400 above.
		return new Response('Webhook handler error', { status: 500 });
	}
};
