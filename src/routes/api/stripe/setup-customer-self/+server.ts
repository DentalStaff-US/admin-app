// Self-serve version of /api/stripe/setup-customer for the client to call on
// their own behalf during onboarding (or any time they want to add a payment
// method via the dashboard banner / settings billing card).
//
// Intentionally identical to the admin endpoint below the auth check — both
// route through the shared `ensureStripeCustomer` / `recordBillingSetupPending`
// helpers and reconcile against Stripe before touching DB state. The webhook
// continues to flip `stripeCustomerSetupPending` to false on
// `checkout.session.completed`, but this endpoint also short-circuits when
// Stripe truth already reflects setup-complete (so the user clicking the
// button again from a stale UI doesn't reset their billing state).

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ensureStripeCustomer,
	createSetupCheckoutSession
} from '$lib/server/stripe';
import {
	getClientProfilebyUserId,
	getClientProfileByStaffUserId
} from '$lib/server/database/queries/clients';
import {
	recordBillingSetupPending,
	syncBillingFromStripe
} from '$lib/server/database/queries/billing';
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

		// Reconcile first — short-circuit when Stripe says we're done.
		const state = await syncBillingFromStripe(clientId);
		if (state.hasPaymentMethod) {
			return json({ alreadySetUp: true, message: 'Billing is already set up.' });
		}

		const customerId = await ensureStripeCustomer({
			clientId,
			userId: user.id,
			email: user.email,
			name: `${user.firstName} ${user.lastName}`,
			existingCustomerId: state.stripeCustomerId
		});

		const origin = request.headers.get('origin') ?? '';
		const { url } = await createSetupCheckoutSession({
			customerId,
			clientId,
			userId: user.id,
			successUrl: `${origin}/setup-complete`,
			cancelUrl: `${origin}/setup-complete?canceled=1`
		});

		await recordBillingSetupPending({
			clientId,
			userId: user.id,
			stripeCustomerId: customerId
		});

		return json({ url });
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
