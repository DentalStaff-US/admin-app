import { invoiceTable } from './../../../../lib/server/database/schemas/requisition';
import { stripe } from '$lib/server/stripe';
import { json } from '@sveltejs/kit';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
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
import { voidInvoiceAndNotify } from '$lib/server/invoices/voidNotify';
import {
	accrueCommissionForPaidInvoice,
	reverseCommissionForInvoice
} from '$lib/server/affiliate/accrual';
import { syncConnectAccount } from '$lib/server/affiliate/connect';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { recordAction, type RecordActionInput } from '$lib/server/audit/audit';

// Ledger rows for Stripe-driven transitions. Never let a ledger failure 500
// the webhook — Stripe would retry and we'd double-process the event.
async function auditFromStripe(
	stripeEvent: Stripe.Event,
	input: Omit<RecordActionInput, 'actor' | 'source'>
) {
	try {
		await recordAction({
			...input,
			actor: null,
			source: 'STRIPE',
			metadata: {
				stripeEventId: stripeEvent.id,
				stripeEventType: stripeEvent.type,
				...(input.metadata ?? {})
			}
		});
	} catch (err) {
		logger.error('stripe webhook: ledger write failed', {
			error: err,
			stripeEventId: stripeEvent.id
		});
	}
}

/** Try each configured signing secret in turn; null if none verifies. */
function constructEventWithAnySecret(payload: string, signature: string): Stripe.Event | null {
	const secrets = [STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
		(s): s is string => Boolean(s)
	);
	let lastError: unknown;
	for (const secret of secrets) {
		try {
			return stripe.webhooks.constructEvent(payload, signature, secret);
		} catch (err) {
			lastError = err;
		}
	}
	logger.error('stripe webhook signature verification failed', {
		error: lastError,
		secretsTried: secrets.length
	});
	return null;
}

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		logger.warn('stripe webhook missing signature header');
		return new Response('No stripe signature', { status: 400 });
	}

	// Step 1: verify signature. A failure here is a 400 — Stripe will not retry.
	//
	// In production this URL is registered TWICE in the Stripe dashboard, because
	// an endpoint listens to either the platform account's events OR connected
	// accounts' events, never both — and each registration has its own signing
	// secret. The connected-account endpoint (which delivers `account.updated` for
	// affiliate Express accounts) signs with STRIPE_CONNECT_WEBHOOK_SECRET. Locally,
	// `stripe listen` uses one secret for both, so the second is optional.
	const event = constructEventWithAnySecret(payload, signature);
	if (!event) {
		return new Response('Webhook Error: signature verification failed', { status: 400 });
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
					// Only a real status transition is ledger-worthy; Stripe fires
					// invoice.updated for plenty of no-op metadata changes.
					if (invoiceUpdated.status && invoiceUpdated.status !== existingInvoice.status) {
						await auditFromStripe(event, {
							entityType: 'INVOICES',
							entityId: existingInvoice.id,
							action: 'STATUS_CHANGE',
							before: { status: existingInvoice.status },
							after: { status: invoiceUpdated.status },
							metadata: {
								stripeInvoiceId: invoiceUpdated.id,
								from: existingInvoice.status,
								to: invoiceUpdated.status,
								timesheetId: existingInvoice.timesheetId ?? null
							}
						});
					}
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

				// Persist the failed-attempt state onto our invoice row so the invoice
				// detail page can surface a "Payment failed" line. Stripe's attempt_count
				// is the authoritative retry counter; `attempted` flips true on the first
				// try. Keyed by stripeInvoiceId; a no-op if we don't have the row.
				if (invoicePaymentFailed.id) {
					await db
						.update(invoiceTable)
						.set({
							attempted: true,
							attemptCount: invoicePaymentFailed.attempt_count ?? 0,
							updatedAt: new Date()
						})
						.where(eq(invoiceTable.stripeInvoiceId, invoicePaymentFailed.id));
					const [failedRow] = await db
						.select({ id: invoiceTable.id, timesheetId: invoiceTable.timesheetId })
						.from(invoiceTable)
						.where(eq(invoiceTable.stripeInvoiceId, invoicePaymentFailed.id))
						.limit(1);
					if (failedRow) {
						await auditFromStripe(event, {
							entityType: 'INVOICES',
							entityId: failedRow.id,
							action: 'STATUS_CHANGE',
							metadata: {
								stripeInvoiceId: invoicePaymentFailed.id,
								paymentFailed: true,
								attemptCount: invoicePaymentFailed.attempt_count ?? 0,
								amountDue: (invoicePaymentFailed.amount_due / 100).toFixed(2),
								timesheetId: failedRow.timesheetId ?? null
							}
						});
					}
				}
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

					await auditFromStripe(event, {
						entityType: 'INVOICES',
						entityId: existingPaidInvoice.id,
						action: 'PAYMENT_RECORDED',
						before: {
							status: existingPaidInvoice.status,
							amountPaid: existingPaidInvoice.amountPaid
						},
						after: {
							status: invoicePaymentSucceeded.status || 'open',
							amountPaid: (invoicePaymentSucceeded.amount_paid / 100).toFixed(2)
						},
						metadata: {
							via: 'STRIPE_WEBHOOK',
							stripeInvoiceId: invoicePaymentSucceeded.id,
							amountPaid: (invoicePaymentSucceeded.amount_paid / 100).toFixed(2),
							timesheetId: existingPaidInvoice.timesheetId ?? null
						}
					});

					// Affiliate commission accrues on PAYMENT, not on timesheet approval.
					// Idempotent (UNIQUE idempotency_key) so Stripe's webhook redelivery
					// cannot double-pay, and it swallows its own errors so a bookkeeping
					// failure never turns into an endless Stripe retry.
					await accrueCommissionForPaidInvoice(existingPaidInvoice.id);
				}
				break;
			}

			// Affiliate Connect onboarding progress. `payouts_enabled` is the gate
			// the monthly payout run checks; until it flips true the affiliate's
			// balance simply carries.
			case 'account.updated': {
				await syncConnectAccount(event.data.object as Stripe.Account);
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
					// Always sync the Stripe status string. Then flip our own status to
					// void + email the client via the shared gate — which notifies exactly
					// once: if this void originated from an in-app action that already
					// voided the record, voidInvoiceAndNotify is a no-op here (no second
					// email). This branch is what covers voids initiated from the Stripe
					// dashboard, which have no in-app action behind them.
					await db
						.update(invoiceTable)
						.set({ stripeStatus: invoiceVoided.status })
						.where(eq(invoiceTable.id, existingVoidedInvoice.id));
					await voidInvoiceAndNotify(existingVoidedInvoice.id, 'Invoice voided in Stripe.');
					if (existingVoidedInvoice.status !== 'void') {
						await auditFromStripe(event, {
							entityType: 'INVOICES',
							entityId: existingVoidedInvoice.id,
							action: 'VOID',
							before: { status: existingVoidedInvoice.status },
							after: { status: 'void' },
							metadata: {
								stripeInvoiceId: invoiceVoided.id,
								reason: 'Invoice voided in Stripe.',
								timesheetId: existingVoidedInvoice.timesheetId ?? null
							}
						});
					}
					// Unpaid commission drops out of its cohort; already-paid commission
					// gets an offsetting negative row against the next payout.
					await reverseCommissionForInvoice(existingVoidedInvoice.id, 'Invoice voided in Stripe.');
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
