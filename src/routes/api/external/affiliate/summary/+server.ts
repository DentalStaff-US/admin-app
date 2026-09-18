import { json, error, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	getAffiliateByUserId,
	getPrimaryCode,
	getAffiliateSummary,
	getAffiliateConfig
} from '$lib/server/database/queries/affiliates';
import { resolveCommissionRate } from '$lib/server/affiliate/commission';
import { reconcileConnectFromStripe } from '$lib/server/affiliate/connect';
import { logger } from '$lib/server/logger';

/** Portal dashboard headline numbers. */
export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	const config = await getAffiliateConfig();
	if (!config.programEnabled) throw error(503, 'Affiliate program is not enabled');

	let affiliate = await getAffiliateByUserId(user.id);
	if (!affiliate) throw error(404, 'Not enrolled in the affiliate program');

	// Self-heal the Connect flags. The "account exists but payouts not enabled"
	// state is transient — it should only last until account.updated arrives. If
	// we still see it, the webhook may have been missed, so ask Stripe directly.
	// Bounded cost: one Stripe read, only while in that state, never once ready.
	if (affiliate.stripeConnectAccountId && !affiliate.connectPayoutsEnabled) {
		try {
			await reconcileConnectFromStripe(affiliate.id);
			affiliate = (await getAffiliateByUserId(user.id)) ?? affiliate;
		} catch (err) {
			// Stripe being unreachable must not break the dashboard.
			logger.warn('affiliate connect reconcile failed', { error: err, affiliateId: affiliate.id });
		}
	}

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
