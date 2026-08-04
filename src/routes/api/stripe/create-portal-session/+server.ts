import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { json, error } from '@sveltejs/kit';
import {
	getClientProfilebyUserId,
	getClientProfileByStaffUserId
} from '$lib/server/database/queries/clients';
import { getClientBillingInfo } from '$lib/server/database/queries/billing';
import { USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';

/**
 * Stripe customer portal — where a client manages payment methods, re-authorizes
 * a lapsed ACH mandate, and views invoices. Available to any client with a
 * Stripe customer; a subscription is NOT required (the settings page used to
 * only offer this once a subscription existed, which left payment-method-only
 * customers with no route into Stripe at all).
 */
export const POST: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;

	if (!user) {
		throw error(401, 'Unauthorized');
	}
	if (user.role !== USER_ROLES.CLIENT && user.role !== USER_ROLES.CLIENT_STAFF) {
		throw error(403, 'Only clients can manage billing');
	}

	// Staff have no client profile of their own — resolve through the company
	// they belong to. Looking them up by user id returned nothing and threw on
	// `client.id`, so this route 500'd for every CLIENT_STAFF caller.
	const client =
		user.role === USER_ROLES.CLIENT_STAFF
			? await getClientProfileByStaffUserId(user.id)
			: await getClientProfilebyUserId(user.id);

	if (!client) {
		throw error(404, 'Client profile not found');
	}

	const billingInfo = await getClientBillingInfo(client.id);

	if (!billingInfo?.clientSubscription?.stripeCustomerId) {
		throw error(400, 'No Stripe customer ID found');
	}

	try {
		const returnUrl = `${url.origin}/settings`;

		const portalSession = await stripe.billingPortal.sessions.create({
			customer: billingInfo.clientSubscription.stripeCustomerId,
			return_url: returnUrl
		});

		return json({ url: portalSession.url });
	} catch (err) {
		logger.error('stripe billing portal session creation failed', {
			error: err,
			stripe_customer_id: billingInfo.clientSubscription.stripeCustomerId,
			distinctId: user?.id
		});
		throw error(500, 'Error creating portal session');
	}
};
