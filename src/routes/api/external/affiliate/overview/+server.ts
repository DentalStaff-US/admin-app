import { json, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import { getAffiliateOverview } from '$lib/server/affiliate/status';
import { PARTNER_PORTAL_URL } from '$lib/config/portal';

/** The professional's Home widget: status, link and a short activity summary. */
export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);
	return json(await getAffiliateOverview(user.id, user.role, PARTNER_PORTAL_URL));
};
