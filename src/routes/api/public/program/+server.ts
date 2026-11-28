import type { RequestHandler } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import {
	corsPreflight,
	guardPublicRequest,
	publicError,
	publicJson
} from '$lib/server/publicJobs/http';

/**
 * Referral program terms for the marketing site, so the rate it advertises is
 * the one set in Admin → Affiliates. Program defaults only: per-affiliate
 * overrides are private. Not behind the job-board kill switch.
 */
export const GET: RequestHandler = async (event) => {
	const blocked = guardPublicRequest(event, { jobBoard: false });
	if (blocked) return blocked;

	try {
		const config = await getAffiliateConfig();
		return publicJson(
			{
				referralCommissionPercent: Number(config.commissionRate),
				referralPayoutMinimum: Number(config.payoutMinimum)
			},
			{ request: event.request }
		);
	} catch (err) {
		logger.error('public program terms failed', { error: err, path: event.url.pathname });
		return publicError(event.request, 500, { message: 'Internal server error' });
	}
};

export const OPTIONS: RequestHandler = async ({ request }) =>
	corsPreflight(request, { jobBoard: false });
