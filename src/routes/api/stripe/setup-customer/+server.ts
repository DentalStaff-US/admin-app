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
import { ensureStripeCustomer, createSetupCheckoutSession } from '$lib/server/stripe';
import { resolveBillingRecipient, toStripeAddress } from '$lib/server/billing/recipients';
import { getClientProfileById } from '$lib/server/database/queries/clients';
import {
	recordBillingSetupPending,
	syncBillingFromStripe
} from '$lib/server/database/queries/billing';
import { logger } from '$lib/server/logger';
import { EmailService } from '$lib/server/email/emailService';
import { EMAIL_TEMPLATES } from '$lib/server/email/templates';

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

		// Stripe's customer email drives its receipts and dunning, so it should be
		// the billing contact rather than the login email. Falls back to the
		// account email when no billing contact is set.
		const billingRecipient = await resolveBillingRecipient(clientId);

		const customerId = await ensureStripeCustomer({
			clientId,
			userId: clientData.user.id,
			email: billingRecipient?.email ?? clientData.user.email,
			...(billingRecipient?.address ? { address: toStripeAddress(billingRecipient.address) } : {}),
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

		// Email the link to the customer so they can finish setup even when they're
		// not in front of an admin (the whole point of "Resend Setup Link"). Don't
		// fail the request if the email errors — the admin still gets the copyable
		// link in the response.
		let emailed = false;
		try {
			const emailService = new EmailService();
			const t = EMAIL_TEMPLATES.billingSetupLinkEmail({
				clientName: `${clientData.user.firstName} ${clientData.user.lastName}`,
				setupLink: url
			});
			const result = await emailService.sendEmail({
				to: [{ email: clientData.user.email }],
				subject: t.subject,
				html: t.htmlEmail,
				text: t.textEmail
			});
			emailed = result.success;
			if (!result.success) {
				logger.error('setup-customer: setup link email did not send', {
					clientId,
					email: clientData.user.email,
					result
				});
			}
		} catch (emailErr) {
			logger.error('setup-customer: failed to email setup link', {
				error: emailErr,
				clientId,
				email: clientData.user.email
			});
		}

		return json({ url, emailed, emailedTo: clientData.user.email });
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
