import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { json, error } from '@sveltejs/kit';
import { getClientProfilebyUserId } from '$lib/server/database/queries/clients';
import { getClientBillingInfo } from '$lib/server/database/queries/billing';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;

	const client = await getClientProfilebyUserId(user?.id);
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