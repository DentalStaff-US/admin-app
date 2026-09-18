import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import { getAffiliateByUserId } from '$lib/server/database/queries/affiliates';
import { createConnectDashboardLink } from '$lib/server/affiliate/connect';

/**
 * Login link to the affiliate's Express Dashboard, for accounts that have
 * already completed onboarding. Returns 409 when there is no connected account
 * yet so the caller can send them through onboarding instead.
 */
export const POST: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	const affiliate = await getAffiliateByUserId(user.id);
	if (!affiliate) throw error(404, 'Not enrolled in the affiliate program');

	const url = await createConnectDashboardLink(affiliate.id);
	if (!url) throw error(409, 'No connected account yet');

	return json({ success: true, url });
};
