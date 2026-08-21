import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import { getAffiliateByUserId, listReferrals } from '$lib/server/database/queries/affiliates';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await authenticateUser(request);
	const affiliate = await getAffiliateByUserId(user.id);
	if (!affiliate) throw error(404, 'Not enrolled in the affiliate program');

	const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
	const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

	const rows = await listReferrals(affiliate.id, limit, offset);
	return json({ rows, limit, offset });
};
