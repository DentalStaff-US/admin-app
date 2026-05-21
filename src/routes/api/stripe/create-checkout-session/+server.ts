import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { priceId } = await request.json();
	const user = locals.user;

	try {
		const session = await stripe.checkout.sessions.create({
			mode: 'subscription',
			payment_method_types: ['card', 'us_bank_account'],
			line_items: [
				{
					price: priceId,
					quantity: 1
				}
			],
			success_url: `${request.headers.get('origin')}/settings/?billing-success=true`,
			cancel_url: `${request.headers.get('origin')}/settings/?billing-canceled=true`,
			customer_email: user?.email,
			client_reference_id: user?.id
		});

		if (user?.id) {
			logger.event('subscription_checkout_started', {
				distinctId: user.id,
				price_id: priceId,
				stripe_session_id: session.id
			});
		}

		return json({ url: session.url });
	} catch (err) {
		logger.error('create-checkout-session failed', {
			error: err,
			price_id: priceId,
			distinctId: user?.id
		});
		return new Response('Error creating checkout session', { status: 500 });
	}
};
