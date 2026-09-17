import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	ensureAffiliateProfile,
	getAffiliateConfig
} from '$lib/server/database/queries/affiliates';
import { createConnectOnboardingLink } from '$lib/server/affiliate/connect';
import { logger } from '$lib/server/logger';

/**
 * Returns a Stripe-hosted onboarding URL for the calling affiliate. All Stripe
 * calls stay in this app; the portal only ever redirects to the URL we hand back.
 */
export const POST: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	const config = await getAffiliateConfig();
	if (!config.programEnabled) throw error(503, 'Affiliate program is not enabled');

	const { returnUrl, refreshUrl } = (await request.json().catch(() => ({}))) as {
		returnUrl?: string;
		refreshUrl?: string;
	};
	if (!returnUrl || !refreshUrl) throw error(400, 'returnUrl and refreshUrl are required');

	const { profile } = await ensureAffiliateProfile(user.id, {
		displayName: user.name,
		contactEmail: user.email
	});

	try {
		const link = await createConnectOnboardingLink({
			affiliateId: profile.id,
			email: user.email,
			returnUrl,
			refreshUrl
		});
		return json({ success: true, url: link.url });
	} catch (err) {
		// Stripe configuration problems (Connect not enabled on this account, key
		// for the wrong account, etc.) are operator errors, not server faults.
		// Surface them as 502 with the message so they are diagnosable from the
		// portal, rather than an uncaught 500 with a stack trace.
		const message = err instanceof Error ? err.message : 'Stripe request failed';
		logger.error('affiliate connect onboarding failed', {
			error: err,
			affiliateId: profile.id
		});
		throw error(502, `Could not start Stripe onboarding: ${message}`);
	}
};
