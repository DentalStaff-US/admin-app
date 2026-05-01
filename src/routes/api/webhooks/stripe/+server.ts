import {
	invoiceTable,
	timeSheetTable,
	type TimeSheetSelect
} from './../../../../lib/server/database/schemas/requisition';
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
import { getPostHogClient } from '$lib/server/posthog';
import { dev } from '$app/environment';
import posthog from 'posthog-js';
// import {
// 	createInvoiceRecord,
// 	getTimesheetDetails
// } from '$lib/server/database/queries/requisitions';

export const POST: RequestHandler = async ({ request }) => {
	console.log('Webhook received');
	console.log('Webhook Secret: ', STRIPE_WEBHOOK_SECRET);

	// Get the raw body directly as text instead of converting to buffer
	const payload = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		console.error('No stripe signature found');
		return new Response('No stripe signature', { status: 400 });
	}

	try {
		if (dev) console.log('Constructing event...');
		const event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
		if (dev) console.log('Event constructed successfully:', event.type);

		const posthog = getPostHogClient();

		// Add special handling for invoice.paid events
		switch (event.type) {
			case 'checkout.session.completed':
				if (dev) console.log('Handling checkout session completed');
				const session = event.data.object as Stripe.Checkout.Session;

				// Check if this is setup mode (payment method collection)
				if (session.mode === 'setup') {
					await handleCustomerSetupCompleted(session);
				} else {
					// Existing subscription checkout logic
					await handleCheckoutCompleted(session);
				}
				break;

			case 'customer.subscription.created':
				if (dev) console.log('Handling customer subscription created');
				const newSubscription = event.data.object as Stripe.Subscription;
				await handleSubscriptionCreated(newSubscription);
				posthog.capture({
					distinctId: newSubscription.metadata?.userId ?? String(newSubscription.customer),
					event: 'subscription_created',
					properties: {
						stripe_subscription_id: newSubscription.id,
						plan: newSubscription.items.data[0]?.price?.id ?? null,
						status: newSubscription.status
					}
				});
				break;

			case 'customer.subscription.updated':
				if (dev) console.log('Handling customer subscription updated');
				await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
				break;

			case 'customer.subscription.deleted':
				if (dev) console.log('Handling customer subscription deleted');
				const deletedSubscription = event.data.object as Stripe.Subscription;
				await handleSubscriptionDeleted(deletedSubscription);
				// TODO: handle subscription delete/cleanup in database
				await db
					.delete(clientSubscriptionTable)
					.where(
						eq(clientSubscriptionTable.stripeCustomerId, deletedSubscription.customer as string)
					);
				posthog.capture({
					distinctId: deletedSubscription.metadata?.userId ?? String(deletedSubscription.customer),
					event: 'subscription_cancelled',
					properties: {
						stripe_subscription_id: deletedSubscription.id,
						status: deletedSubscription.status
					}
				});
				break;
			case 'invoice.created':
				if (dev) console.log('Handling invoice created');
				const invoiceCreated = event.data.object as Stripe.Invoice;
				if (dev) console.log(invoiceCreated);
				break;

			case 'invoice.updated':
				if (dev) console.log('Handling invoice updated');
				const invoiceUpdated = event.data.object as Stripe.Invoice;
				if (dev) console.log(invoiceUpdated);
				const [existingInvoice] = await db
					.select()
					.from(invoiceTable)
					.where(eq(invoiceTable.stripeInvoiceId, invoiceUpdated.id))
					.limit(1);
				if (existingInvoice) {
					if (dev) console.log('Invoice exists in the database:', existingInvoice);
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
				} else {
					if (dev) console.log('Invoice does not exist in the database, creating new record');
				}
				break;
			case 'invoice.finalized':
				if (dev) console.log('Handling invoice finalized');
				const invoiceFinalized = event.data.object as Stripe.Invoice;
				const userId = invoiceFinalized.metadata?.userId;
				const clientId = invoiceFinalized.metadata?.clientId;
				let timesheet: TimeSheetSelect | null = null;

				if (!userId && !clientId) {
					if (dev) {
						console.error('No userId or clientId in metadata for invoice:', invoiceFinalized.id);
					}
					posthog.capture({
						distinctId: 'server',
						event: 'invoice_finalization_error',
						properties: {
							error: 'No userId or clientId in metadata',
							stripe_invoice_id: invoiceFinalized.id
						}
					});
					break;
				}

				const client = userId
					? await getClientProfilebyUserId(userId)
					: clientId
						? await getClientProfileById(clientId)
						: null;

				if (!client) {
					if (dev) {
						console.error(
							'No client found for invoice:',
							invoiceFinalized.id,
							'userId:',
							userId,
							'clientId:',
							clientId
						);
					}
					posthog.capture({
						distinctId: 'server',
						event: 'invoice_finalization_error',
						properties: {
							error: 'No client found for userId or clientId in metadata',
							stripe_invoice_id: invoiceFinalized.id,
							userId,
							clientId
						}
					});
					break; // never return 400 here — Stripe will retry forever
				}

				if (invoiceFinalized.metadata?.timesheetId) {
					const [result] = await db
						.select()
						.from(timeSheetTable)
						.where(eq(timeSheetTable.id, invoiceFinalized.metadata?.timesheetId))
						.limit(1);
					timesheet = result as TimeSheetSelect;
				}

				const invoice = event.data.object as Stripe.Invoice;
				if (dev) console.log('Invoice paid:', invoice.id);
				break;
			case 'invoice.payment_failed':
				if (dev) console.log('Handling invoice payment failed');
				const invoicePaymentFailed = event.data.object as Stripe.Invoice;
				if (dev) console.log(invoicePaymentFailed);
				break;
			case 'invoice.payment_succeeded':
				if (dev) console.log('Handling invoice payment succeeded');
				const invoicePaymentSucceeded = event.data.object as Stripe.Invoice;
				if (dev) console.log(invoicePaymentSucceeded);
				const [existingPaidInvoice] = await db
					.select()
					.from(invoiceTable)
					.where(eq(invoiceTable.stripeInvoiceId, invoicePaymentSucceeded.id))
					.limit(1);
				if (existingPaidInvoice) {
					if (dev) console.log('Invoice  exists in the database:', existingPaidInvoice);
					await db
						.update(invoiceTable)
						.set({
							status: 'paid',
							stripeStatus: invoicePaymentSucceeded.status,
							paidAt: new Date(),
							amountDue: (invoicePaymentSucceeded.amount_due / 100).toFixed(2),
							amountPaid: (invoicePaymentSucceeded.amount_paid / 100).toFixed(2),
							amountRemaining: (invoicePaymentSucceeded.amount_remaining / 100).toFixed(2)
						})
						.where(eq(invoiceTable.id, existingPaidInvoice.id));
					posthog.capture({
						distinctId:
							invoicePaymentSucceeded.metadata?.userId ?? String(invoicePaymentSucceeded.customer),
						event: 'invoice_payment_succeeded',
						properties: {
							stripe_invoice_id: invoicePaymentSucceeded.id,
							amount_paid: invoicePaymentSucceeded.amount_paid / 100,
							currency: invoicePaymentSucceeded.currency,
							invoice_id: existingPaidInvoice.id
						}
					});
				}
				break;
			// case 'invoice.overdue':
			// 	console.log('Handling invoice overdue');
			// 	const invoiceOverdue = event.data.object as Stripe.Invoice;
			// 	console.log(invoiceOverdue);
			// 	const [existingOverdueInvoice] = await db
			// 		.select()
			// 		.from(invoiceTable)
			// 		.where(eq(invoiceTable.stripeInvoiceId, invoiceOverdue.id))
			// 		.limit(1);
			// 	if (existingOverdueInvoice) {
			// 		console.log('Invoice  exists in the database:', existingOverdueInvoice);
			// 		await db
			// 			.update(invoiceTable)
			// 			.set({
			// 				status: 'overdue',
			// 				stripeStatus: invoiceOverdue.status
			// 			})
			// 			.where(eq(invoiceTable.id, existingOverdueInvoice.id));
			// 	}
			// 	break;
			case 'invoice.voided':
				if (dev) console.log('Handling invoice voided');
				const invoiceVoided = event.data.object as Stripe.Invoice;
				if (dev) console.log(invoiceVoided);
				const [existingVoidedInvoice] = await db
					.select()
					.from(invoiceTable)
					.where(eq(invoiceTable.stripeInvoiceId, invoiceVoided.id))
					.limit(1);
				if (existingVoidedInvoice) {
					if (dev) console.log('Invoice  exists in the database:', existingVoidedInvoice);
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

		return json({ received: true });
	} catch (err) {
		if (dev) console.error('Full webhook error:', err);
		if (dev) console.error('Error message:', (err as Error).message);
		return new Response(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown Error'}`, {
			status: 400
		});
	}
};
