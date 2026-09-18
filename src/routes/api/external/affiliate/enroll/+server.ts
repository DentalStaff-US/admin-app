import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	ensureAffiliateProfile,
	getAffiliateConfig
} from '$lib/server/database/queries/affiliates';

/** Idempotent enrolment. Safe to call on every portal load. */
export const POST: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	const config = await getAffiliateConfig();
	if (!config.programEnabled) throw error(503, 'Affiliate program is not enabled');

	const { profile, code, created } = await ensureAffiliateProfile(user.id, {
		displayName: user.name,
		contactEmail: user.email
	});

	return json({
		success: true,
		created,
		affiliateId: profile.id,
		pid: profile.pid,
		status: profile.status,
		referralCode: code
	});
};
