// Self-serve version of /api/stripe/setup-customer for the client to call on
// their own behalf during onboarding (or any time they want to add a payment
// method via the dashboard banner / settings billing card).
//
// Mirrors the admin endpoint's Stripe flow exactly — creates the Customer if
// needed, opens a setup-mode Checkout Session, stamps clientSubscriptionTable
// with stripeCustomerSetupPending=true — but resolves the client from the
// logged-in user instead of taking clientId as input. The webhook flips
// stripeCustomerSetupPending back to false on checkout.session.completed.

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import {
	getClientProfilebyUserId,
	getClientProfileByStaffUserId
} from '$lib/server/database/queries/clients';
import db from '$lib/server/database/drizzle';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;

	if (!user) {
		throw error(401, 'Unauthorized');
	}
	if (user.role !== USER_ROLES.CLIENT && user.role !== USER_ROLES.CLIENT_STAFF) {
		throw error(403, 'Only clients can set up their own billing');
	}

	try {
		const clientProfile =
			user.role === USER_ROLES.CLIENT_STAFF
				? await getClientProfileByStaffUserId(user.id)
				: await getClientProfilebyUserId(user.id);

		if (!clientProfile) {
			throw error(404, 'Client profile not found');
		}

		const clientId = clientProfile.id;

		const [existingSubscription] = await db
			.select()
			.from(clientSubscriptionTable)
			.where(eq(clientSubscriptionTable.clientId, clientId))
			.limit(1);

		let customerId = existingSubscription?.stripeCustomerId;

		if (!customerId) {
			const customer = await stripe.customers.create({
				email: user.email,
				name: `${user.firstName} ${user.lastName}`,
				metadata: {
					clientId,
					userId: user.id
				}
			});
			customerId = customer.id;
		}

		const origin = request.headers.get('origin');
		const session = await stripe.checkout.sessions.create({
			mode: 'setup',
			currency: 'usd',
			customer: customerId,
			payment_method_types: ['card', 'us_bank_account'],
			success_url: `${origin}/setup-complete`,
			cancel_url: `${origin}/setup-complete?canceled=1`,
			metadata: {
				clientId,
				setupType: 'client_self_serve'
			}
		});

		if (existingSubscription) {
			await db
				.update(clientSubscriptionTable)
				.set({
					stripeCustomerId: customerId,
					stripeCustomerSetupPending: true,
					updatedAt: new Date()
				})
				.where(eq(clientSubscriptionTable.clientId, clientId));
		} else {
			await db.insert(clientSubscriptionTable).values({
				id: nanoid(),
				clientId,
				stripeCustomerId: customerId,
				status: 'inactive',
				stripeCustomerSetupPending: true,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		return json({ url: session.url });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
			throw err;
		}
		logger.error('stripe setup-customer-self failed', {
			error: err,
			distinctId: user.id
		});
		throw error(500, 'Failed to create setup session');
	}
};
