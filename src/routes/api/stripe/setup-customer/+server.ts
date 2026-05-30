// /routes/api/stripe/setup-customer/+server.ts
//
// Admin-initiated billing setup. Thin wrapper over the shared helpers —
// everything below the auth check is intentionally identical to the
// client-initiated `setup-customer-self` endpoint. Any divergence here means
// the two paths can produce different DB state for the same client, which is
// the regression class we just unwound (Ginny — admin "Resend Link" reset
// her pending bit despite Stripe already having her payment method).

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ensureStripeCustomer,
	createSetupCheckoutSession
} from '$lib/server/stripe';
import { getClientProfileById } from '$lib/server/database/queries/clients';
import {
	recordBillingSetupPending,
	syncBillingFromStripe
} from '$lib/server/database/queries/billing';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;

	if (!user || user.role !== 'SUPERADMIN') {
		throw error(403, 'Unauthorized');
	}

	let requestedClientId: string | undefined;
	try {
		const { clientId } = await request.json();
		requestedClientId = clientId;

		if (!clientId) {
			throw error(400, 'Client ID is required');
		}

		const clientData = await getClientProfileById(clientId);
		if (!clientData) {
			throw error(404, 'Client not found');
		}

		// Reconcile first: if Stripe already has this customer with a default
		// payment method, short-circuit without resetting pending=true or
		// creating a stale Checkout session. This heals drift caused by
		// previous "Resend Link" clicks AND keeps repeat clicks idempotent.
		const state = await syncBillingFromStripe(clientId);
		if (state.hasPaymentMethod) {
			return json({
				alreadySetUp: true,
				message: 'Client is already set up.'
			});
		}

		const customerId = await ensureStripeCustomer({
			clientId,
			userId: clientData.user.id,
			email: clientData.user.email,
			name: `${clientData.user.firstName} ${clientData.user.lastName}`,
			existingCustomerId: state.stripeCustomerId
		});

		const origin = request.headers.get('origin') ?? '';
		const { url } = await createSetupCheckoutSession({
			customerId,
			clientId,
			userId: clientData.user.id,
			successUrl: `${origin}/setup-complete`,
			cancelUrl: `${origin}/setup-complete`
		});

		await recordBillingSetupPending({
			clientId,
			userId: clientData.user.id,
			stripeCustomerId: customerId
		});

		return json({ url });
	} catch (err) {
		// Pass through SvelteKit HttpErrors (400/403/404) — they're expected client errors.
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
			throw err;
		}
		logger.error('stripe setup-customer failed', {
			error: err,
			clientId: requestedClientId,
			distinctId: user.id
		});
		throw error(500, 'Failed to create setup session');
	}
};
