// /routes/api/stripe/setup-customer/+server.ts

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { getClientProfileById } from '$lib/server/database/queries/clients';
import db from '$lib/server/database/drizzle';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;

	if (!user || user.role !== 'SUPERADMIN') {
		throw error(403, 'Unauthorized');
	}

	try {
		const { clientId } = await request.json();

		if (!clientId) {
			throw error(400, 'Client ID is required');
		}

		const clientData = await getClientProfileById(clientId);

		if (!clientData) {
			throw error(404, 'Client not found');
		}

		// Check if customer already exists in our DB
		const [existingSubscription] = await db
			.select()
			.from(clientSubscriptionTable)
			.where(eq(clientSubscriptionTable.clientId, clientId))
			.limit(1);

		let customerId = existingSubscription?.stripeCustomerId;

		// If no customer exists, create one in Stripe FIRST
		if (!customerId) {
			console.log('Creating new Stripe customer for:', clientData.user.email);

			const customer = await stripe.customers.create({
				email: clientData.user.email,
				name: `${clientData.user.firstName} ${clientData.user.lastName}`,
				metadata: {
					clientId: clientId,
					userId: clientData.user.id
				}
			});

			customerId = customer.id;
			console.log('Created Stripe customer:', customerId);
		} else {
			console.log('Using existing Stripe customer:', customerId);
		}

		// Create Stripe Checkout Session in SETUP MODE with the customer
		const session = await stripe.checkout.sessions.create({
			mode: 'setup',
			currency: 'usd',
			customer: customerId, // Use customer ID, not customer_email
			payment_method_types: ['card'],
			success_url: `${request.headers.get('origin')}/setup-complete`,
			cancel_url: `${request.headers.get('origin')}/setup-complete`,
			metadata: {
				clientId: clientId,
				setupType: 'internal_customer'
			}
		});

		console.log('Created checkout session:', session.id);

		// Create or update clientSubscription record with pending status
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
				clientId: clientId,
				stripeCustomerId: customerId,
				status: 'inactive',
				stripeCustomerSetupPending: true,
				createdAt: new Date(),
				updatedAt: new Date()
			});
		}

		return json({ url: session.url });
	} catch (err) {
		console.error('Error creating setup session:', err);
		throw error(500, 'Failed to create setup session');
	}
};
