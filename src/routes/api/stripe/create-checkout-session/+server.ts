import type { RequestHandler } from './$types';
import { stripe } from '$lib/server/stripe';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { priceId } = await request.json();
	const user = locals.user; // Assuming you have user data in locals

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

		return json({ url: session.url });
	} catch (err) {
		console.log(err);
		return new Response('Error creating checkout session', {
			status: 500
		});
	}
};
