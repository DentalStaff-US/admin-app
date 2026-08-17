// lib/server/database/queries/billing.ts
import { and, eq, sql } from 'drizzle-orm';
import db from '../drizzle';
import { clientProfileTable, clientSubscriptionTable } from '../schemas/client';
import { stripe, customerHasDefaultPaymentMethod } from '$lib/server/stripe';
import { error, redirect } from '@sveltejs/kit';
import type Stripe from 'stripe';
import { getUserByEmail } from './users';
import { getClientProfilebyUserId } from './clients';
import { userTable } from '../schemas/auth';
import { USER_ROLES } from '$lib/config/constants';
import { env } from '$env/dynamic/public';
import { nanoid } from 'nanoid';

/**
 * Resolve our user record from a Stripe customer.
 *
 * Stripe's `customer.email` used to be the join key here, which was fragile in
 * two directions: clients can edit their email in the Stripe billing portal, and
 * we now sync the *billing* email (not the login email) onto the customer. Both
 * would make an email lookup miss and silently no-op the webhook.
 *
 * `ensureStripeCustomer` stamps `metadata: { clientId, userId }` on every
 * customer it creates, so that is the durable key. The email lookup is kept as a
 * last-resort fallback for customers created before the metadata existed.
 */
async function resolveUserFromStripeCustomer(
	customer: Stripe.Customer
): Promise<{ id: string } | null> {
	const metadataUserId = customer.metadata?.userId;
	if (metadataUserId) {
		const [byId] = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.id, metadataUserId))
			.limit(1);
		if (byId) return byId;
		console.warn('[stripe] customer.metadata.userId did not resolve', {
			customerId: customer.id,
			userId: metadataUserId
		});
	}

	const metadataClientId = customer.metadata?.clientId;
	if (metadataClientId) {
		const [byClient] = await db
			.select({ id: userTable.id })
			.from(clientProfileTable)
			.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
			.where(eq(clientProfileTable.id, metadataClientId))
			.limit(1);
		if (byClient) return byClient;
	}

	// Legacy customers predating the metadata stamp.
	if (customer.email) {
		const byEmail = await getUserByEmail(customer.email);
		if (byEmail) return byEmail;
	}

	console.warn('[stripe] could not resolve a user for customer', { customerId: customer.id });
	return null;
}

export type SubscriptionStatus =
	| 'incomplete'
	| 'incomplete_expired'
	| 'trialing'
	| 'active'
	| 'past_due'
	| 'canceled'
	| 'unpaid'
	| 'paused';

export async function getClientBillingInfo(clientId: string | undefined) {
	if (!clientId) return error(500, 'Must provide client id');

	try {
		const [dbSubscription] = await db
			.select()
			.from(clientSubscriptionTable)
			.where(eq(clientSubscriptionTable.clientId, clientId))
			.limit(1);

		if (!dbSubscription?.stripeCustomerId) {
			return {
				subscription: null,
				paymentMethod: null,
				invoices: []
			};
		}

		// Fetch subscription details from Stripe without expand
		const [subscriptions, paymentMethods, invoices, customer] = await Promise.all([
			stripe.subscriptions.list({
				customer: dbSubscription.stripeCustomerId,
				limit: 1,
				status: 'active'
			}),
			// No `type` filter: this used to request cards only, so an ACH
			// (us_bank_account) customer came back with zero methods and the
			// settings page rendered a blank billing card. Omitting the filter
			// returns every attached method regardless of type.
			stripe.paymentMethods.list({
				customer: dbSubscription.stripeCustomerId,
				limit: 10
			}),
			stripe.invoices.list({
				customer: dbSubscription.stripeCustomerId,
				limit: 12
			}),
			stripe.customers.retrieve(dbSubscription.stripeCustomerId)
		]);

		const activeSubscription = subscriptions.data[0];

		// Prefer the customer's actual default method — `data[0]` is just the
		// most recently attached, which isn't necessarily what we bill.
		const defaultPaymentMethodId =
			customer && !customer.deleted
				? typeof customer.invoice_settings?.default_payment_method === 'string'
					? customer.invoice_settings.default_payment_method
					: (customer.invoice_settings?.default_payment_method?.id ?? null)
				: null;
		const defaultPaymentMethod =
			paymentMethods.data.find((pm) => pm.id === defaultPaymentMethodId) ?? paymentMethods.data[0];

		let productName = null;
		if (activeSubscription) {
			const price = await stripe.prices.retrieve(activeSubscription.items.data[0].price.id);
			const product = await stripe.products.retrieve(price.product as string);
			productName = product.name;
		}

		return {
			clientSubscription: dbSubscription,
			subscription: activeSubscription
				? {
						id: activeSubscription.id,
						status: activeSubscription.status,
						currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
						cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
						priceId: activeSubscription.items.data[0].price.id,
						productName,
						amount: activeSubscription.items.data[0].price.unit_amount! / 100,
						interval: activeSubscription.items.data[0].price.recurring?.interval
					}
				: null,
			// Normalized across payment method types. Card fields stay on the same
			// keys they always used; bank fields are additive, and `type` lets the
			// UI drop the expiry line (bank accounts don't have one).
			paymentMethod: defaultPaymentMethod
				? {
						id: defaultPaymentMethod.id,
						type: defaultPaymentMethod.type,
						brand:
							defaultPaymentMethod.card?.brand ??
							defaultPaymentMethod.us_bank_account?.bank_name ??
							null,
						last4:
							defaultPaymentMethod.card?.last4 ??
							defaultPaymentMethod.us_bank_account?.last4 ??
							null,
						expiryMonth: defaultPaymentMethod.card?.exp_month ?? null,
						expiryYear: defaultPaymentMethod.card?.exp_year ?? null,
						bankName: defaultPaymentMethod.us_bank_account?.bank_name ?? null,
						accountType: defaultPaymentMethod.us_bank_account?.account_type ?? null,
						isDefault: defaultPaymentMethod.id === defaultPaymentMethodId
					}
				: null,
			invoices: invoices.data.map((invoice) => ({
				id: invoice.id,
				number: invoice.number,
				amount: invoice.amount_paid / 100,
				status: invoice.status,
				date: new Date(invoice.created * 1000),
				pdfUrl: invoice.invoice_pdf
			}))
		};
	} catch (error) {
		console.error('Error fetching billing info:', error);
		throw error;
	}
}

export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
	try {
		const customerId = subscription.customer as string;
		const priceId = subscription.items.data[0].price.id;

		const customerData = await stripe.customers.retrieve(customerId);
		if (customerData.deleted === true) {
			console.log('Customer was deleted, skipping subscription creation');
			return;
		}

		const user = await resolveUserFromStripeCustomer(customerData);
		if (!user) {
			console.log('No user found for Stripe customer:', customerId);
			return;
		}

		const client = await getClientProfilebyUserId(user.id);
		if (!client) {
			console.log('No client found for user:', user.id);
			return;
		}

		// Use upsert instead of insert
		await db
			.insert(clientSubscriptionTable)
			.values({
				id: subscription.id,
				clientId: client.id,
				stripeCustomerId: customerId,
				status: subscription.status,
				priceId: priceId,
				createdAt: new Date(subscription.created * 1000),
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: clientSubscriptionTable.id,
				set: {
					status: subscription.status,
					priceId: priceId,
					updatedAt: new Date()
				}
			});

		await db
			.update(userTable)
			.set({ stripeCustomerId: customerId })
			.where(eq(userTable.id, user.id));
	} catch (error) {
		console.error('Error in handleSubscriptionCreated:', error);
		throw error;
	}
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
	const priceId = subscription.items.data[0].price.id;
	const customerId = subscription.customer as string;

	const customerData = await stripe.customers.retrieve(customerId);
	if (customerData.deleted === true) {
		console.log('Customer was deleted, skipping subscription creation');
		return;
	}

	const user = await resolveUserFromStripeCustomer(customerData);
	console.log('Updating subscription for user:', user?.id, JSON.stringify(subscription, null, 2));

	await db
		.update(clientSubscriptionTable)
		.set({
			status: subscription.status,
			priceId: priceId,
			updatedAt: new Date()
		})
		.where(eq(clientSubscriptionTable.id, subscription.id));
	if (user) {
		await db
			.update(userTable)
			.set({ stripeCustomerId: customerId })
			.where(eq(userTable.id, user.id));
	}
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
	await db
		.update(clientSubscriptionTable)
		.set({
			status: 'canceled',
			updatedAt: new Date()
		})
		.where(eq(clientSubscriptionTable.id, subscription.id));
}

export async function handleCustomerSetupCompleted(session: Stripe.Checkout.Session) {
	try {
		const clientId = session.metadata?.clientId;

		if (!clientId) {
			console.log('No clientId in session metadata');
			return;
		}

		// Customer was already created before the session, just verify it exists
		const customerId = session.customer as string;

		if (!customerId) {
			console.error('No customer ID in completed session - this should not happen');
			return;
		}

		console.log('Setup completed for customer:', customerId);

		// Get the setup intent to confirm payment method was attached
		const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string);
		const paymentMethodId = setupIntent.payment_method as string;

		await stripe.customers.update(customerId, {
			invoice_settings: {
				default_payment_method: paymentMethodId
			}
		});

		// Update the clientSubscription record to mark setup complete
		await db
			.update(clientSubscriptionTable)
			.set({
				stripeCustomerSetupPending: false,
				status: 'inactive', // Keep as inactive (no subscription)
				updatedAt: new Date()
			})
			.where(eq(clientSubscriptionTable.clientId, clientId));

		// Also update user table with customer ID (if not already set)
		const [clientProfile] = await db
			.select({ userId: clientProfileTable.userId })
			.from(clientProfileTable)
			.where(eq(clientProfileTable.id, clientId))
			.limit(1);

		if (clientProfile) {
			await db
				.update(userTable)
				.set({ stripeCustomerId: customerId })
				.where(eq(userTable.id, clientProfile.userId));
		}

		console.log('Customer setup completed successfully for client:', clientId);
	} catch (error) {
		console.error('Error in handleCustomerSetupCompleted:', error);
		throw error;
	}
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
	try {
		if (!session.subscription) {
			console.log('No subscription in session');
			return;
		}

		const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

		// Resolve via the customer's metadata rather than `session.customer_email`,
		// which is the Stripe-side address and may now be the billing contact
		// rather than a login email.
		const customerData = await stripe.customers.retrieve(subscription.customer as string);
		if (customerData.deleted === true) {
			console.log('Customer was deleted, skipping checkout completion');
			return;
		}

		const user = await resolveUserFromStripeCustomer(customerData);
		if (!user) {
			console.log('No user found for Stripe customer:', customerData.id);
			return;
		}

		const client = await getClientProfilebyUserId(user.id);
		if (!client) {
			console.log('No client found for user:', user.id);
			return;
		}

		const customerId = subscription.customer as string;
		const priceId = subscription.items.data[0].price.id;

		// Use upsert instead of insert
		await db
			.insert(clientSubscriptionTable)
			.values({
				id: subscription.id,
				clientId: client.id,
				stripeCustomerId: customerId,
				status: subscription.status,
				priceId: priceId,
				createdAt: new Date(subscription.created * 1000),
				updatedAt: new Date()
			})
			.onConflictDoUpdate({
				target: clientSubscriptionTable.id,
				set: {
					status: subscription.status,
					priceId: priceId,
					updatedAt: new Date()
				}
			});
	} catch (error) {
		console.error('Error in handleCheckoutCompleted:', error);
		throw error;
	}
}

export async function checkCustomerSubscriptionStatus(
	clientId: string
): Promise<SubscriptionStatus | null> {
	if (!clientId) {
		throw error(400, 'Client ID is required');
	}
	const [clientSubscription] = await db
		.select({ status: clientSubscriptionTable.status })
		.from(clientSubscriptionTable)
		.where(eq(clientSubscriptionTable.clientId, clientId))
		.limit(1);

	if (!clientSubscription) {
		return null;
	}

	return clientSubscription.status as SubscriptionStatus;
}

export async function redirectIfNotValidCustomer(clientId: string | undefined, role: string) {
	if (!clientId) {
		throw error(400, 'Client ID is required');
	}
	// ONLY FOR INTERNAL INSTANCES TO BYPASS SUBSCRIPTION CHECK
	if (env.PUBLIC_APP_ENV === 'INTERNAL') {
		console.log('[SYSTEM LOG]: INTERNAL ENVIRONMENT - skipping subscription requirements');
		return;
	}
	const status = await checkCustomerSubscriptionStatus(clientId);
	switch (role) {
		case USER_ROLES.CLIENT:
			if (status !== 'active') {
				redirect(302, '/settings?tab=BILLING&role=CLIENT');
			}
			break;
		case USER_ROLES.CLIENT_STAFF:
			if (status !== 'active') {
				redirect(302, '/dashboard');
			}
			break;
	}
}

export type BillingState = {
	stripeCustomerId: string | null;
	setupPending: boolean;
	hasPaymentMethod: boolean;
};

/**
 * Reconcile our billing-setup state for a single client against Stripe truth.
 * Idempotent. Returns the post-reconcile state. Called from:
 *   - both setup endpoints (before deciding whether to issue a fresh Checkout
 *     link — if the client is already set up, short-circuit instead of
 *     resetting `pending=true` and creating a stale Checkout session); and
 *   - the admin client detail page load (so the "Setup Customer" / "Resend
 *     Link" buttons hide automatically when Stripe says the client is done).
 *
 * Why this exists: the webhook (`checkout.session.completed`) is currently
 * the ONLY mechanism that flips `stripe_customer_setup_pending` from true to
 * false. If it ever fails to deliver, our DB is permanently wrong until
 * someone runs a manual UPDATE. This helper gives every interactive path a
 * Stripe-authoritative sync, so drift heals itself the next time anyone
 * touches the relevant surfaces.
 */
export async function syncBillingFromStripe(clientId: string | undefined): Promise<BillingState> {
	if (!clientId) {
		return { stripeCustomerId: null, setupPending: true, hasPaymentMethod: false };
	}

	const [row] = await db
		.select({
			id: clientSubscriptionTable.id,
			stripeCustomerId: clientSubscriptionTable.stripeCustomerId,
			setupPending: clientSubscriptionTable.stripeCustomerSetupPending,
			userId: clientProfileTable.userId
		})
		.from(clientSubscriptionTable)
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientSubscriptionTable.clientId))
		.where(eq(clientSubscriptionTable.clientId, clientId))
		.limit(1);

	if (!row || !row.stripeCustomerId) {
		return {
			stripeCustomerId: row?.stripeCustomerId ?? null,
			setupPending: true,
			hasPaymentMethod: false
		};
	}

	const hasPaymentMethod = await customerHasDefaultPaymentMethod(row.stripeCustomerId);
	const dbSetupPending = row.setupPending ?? true;

	// Case A: Stripe says set up, DB says still pending → flip DB to match.
	// This is the regression-healing path that would have caught Ginny.
	if (hasPaymentMethod && dbSetupPending) {
		await db
			.update(clientSubscriptionTable)
			.set({ stripeCustomerSetupPending: false, updatedAt: new Date() })
			.where(eq(clientSubscriptionTable.id, row.id));
		// Keep the secondary copy in sync.
		await db
			.update(userTable)
			.set({ stripeCustomerId: row.stripeCustomerId })
			.where(eq(userTable.id, row.userId));
		return {
			stripeCustomerId: row.stripeCustomerId,
			setupPending: false,
			hasPaymentMethod: true
		};
	}

	// Case B: Stripe says no PM, DB says complete → admin removed the PM in
	// Stripe directly. Re-mark pending so the setup buttons reappear.
	if (!hasPaymentMethod && !dbSetupPending) {
		await db
			.update(clientSubscriptionTable)
			.set({ stripeCustomerSetupPending: true, updatedAt: new Date() })
			.where(eq(clientSubscriptionTable.id, row.id));
		return {
			stripeCustomerId: row.stripeCustomerId,
			setupPending: true,
			hasPaymentMethod: false
		};
	}

	// Already in agreement — no write.
	return {
		stripeCustomerId: row.stripeCustomerId,
		setupPending: dbSetupPending,
		hasPaymentMethod
	};
}

/**
 * Shared UPSERT used by both setup endpoints. Writes BOTH `client_subscriptions`
 * AND `users.stripe_customer_id` so the secondary copy can't drift. Marks the
 * row `pending=true` because the caller is about to send the client to a
 * Checkout session; the webhook will flip it to false on completion.
 *
 * NOTE: relies on `client_subscriptions.client_id` being unique. The unique
 * constraint is added in the schema; before migrate, the conflict target may
 * not exist — see the verification block in the plan file for the dedupe SQL.
 */
export async function recordBillingSetupPending(opts: {
	clientId: string;
	userId: string;
	stripeCustomerId: string;
}): Promise<void> {
	const now = new Date();
	await db
		.insert(clientSubscriptionTable)
		.values({
			id: nanoid(),
			clientId: opts.clientId,
			stripeCustomerId: opts.stripeCustomerId,
			status: 'inactive',
			stripeCustomerSetupPending: true,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: clientSubscriptionTable.clientId,
			set: {
				stripeCustomerId: opts.stripeCustomerId,
				stripeCustomerSetupPending: true,
				updatedAt: now
			}
		});

	// Keep the secondary copy on `users` in lockstep.
	await db
		.update(userTable)
		.set({ stripeCustomerId: opts.stripeCustomerId })
		.where(
			and(
				eq(userTable.id, opts.userId),
				// Only write when actually different — avoids needless updated_at churn.
				sql`(${userTable.stripeCustomerId} IS NULL OR ${userTable.stripeCustomerId} != ${opts.stripeCustomerId})`
			)
		);
}
