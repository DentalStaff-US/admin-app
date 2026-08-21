import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	ensureAffiliateProfile,
	getAffiliateConfig
} from '$lib/server/database/queries/affiliates';
import { createConnectOnboardingLink } from '$lib/server/affiliate/connect';

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

	const link = await createConnectOnboardingLink({
		affiliateId: profile.id,
		email: user.email,
		returnUrl,
		refreshUrl
	});

	return json({ success: true, url: link.url });
};
