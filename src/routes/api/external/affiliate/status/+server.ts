import { json, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import { getAffiliateSettingsStatus } from '$lib/server/affiliate/status';
import { TERMS_PRIVACY_WEBSITE } from '$lib/config/constants';

/**
 * Drives the small affiliate card on the candidate app's settings page.
 * Returns ONLY status + link — everything else lives in the portal.
 */
export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);
	const status = await getAffiliateSettingsStatus(user.id, user.role, TERMS_PRIVACY_WEBSITE);
	return json(status);
};
