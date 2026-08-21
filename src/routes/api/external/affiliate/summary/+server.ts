import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	getAffiliateByUserId,
	getPrimaryCode,
	getAffiliateSummary,
	getAffiliateConfig
} from '$lib/server/database/queries/affiliates';
import { resolveCommissionRate } from '$lib/server/affiliate/commission';

/** Portal dashboard headline numbers. */
export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	const config = await getAffiliateConfig();
	if (!config.programEnabled) throw error(503, 'Affiliate program is not enabled');

	const affiliate = await getAffiliateByUserId(user.id);
	if (!affiliate) throw error(404, 'Not enrolled in the affiliate program');

	const [code, summary] = await Promise.all([
		getPrimaryCode(affiliate.id),
		getAffiliateSummary(affiliate.id)
	]);

	const rate = resolveCommissionRate({
		affiliateOverride: affiliate.commissionRateOverride,
		programDefault: config.commissionRate
	});

	return json({
		affiliateId: affiliate.id,
		pid: affiliate.pid,
		status: affiliate.status,
		referralCode: code?.code ?? null,
		commissionRatePercent: rate.ratePercent,
		connect: {
			linked: Boolean(affiliate.stripeConnectAccountId),
			payoutsEnabled: affiliate.connectPayoutsEnabled,
			detailsSubmitted: affiliate.connectDetailsSubmitted,
			requirementsDue: affiliate.connectRequirementsDue ?? []
		},
		...summary
	});
};
