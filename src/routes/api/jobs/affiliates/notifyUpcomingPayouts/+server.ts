import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { upcomingPayoutPreview } from '$lib/server/affiliate/financeReconcile';
import { notifyUpcomingPayout } from '$lib/server/affiliate/notifications';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import {
	payableCohortAsOf,
	payoutDateForCohort,
	dollarsToCents,
	parseCohortMonth
} from '$lib/server/affiliate/payoutCycle';
import { centsToDollarString } from '$lib/server/affiliate/commission';
import { logger } from '$lib/server/logger';

/**
 * Runs a few days before the 1st. Tells each affiliate who will be paid on the
 * upcoming run how much is coming and when.
 */
export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'notifyUpcomingAffiliatePayouts', CRON_SECRET);
	if (!verified.ok) return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	try {
		const config = await getAffiliateConfig();
		if (!config.programEnabled) return json({ success: true, skipped: 'PROGRAM_DISABLED' });

		const result = await tryWithAdvisoryLock('affiliate:notifyUpcomingPayouts', async () => {
			// The next 1st, in ET — that's when the payout job fires.
			const now = new Date();
			const next = new Date(now);
			next.setUTCMonth(next.getUTCMonth() + 1, 1);
			const cohort = payableCohortAsOf(next);
			const payoutDate = payoutDateForCohort(cohort);
			const { year, month } = parseCohortMonth(cohort);
			const cohortLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
				month: 'long',
				year: 'numeric'
			});

			const preview = await upcomingPayoutPreview({
				payableCohort: cohort,
				minimumCents: dollarsToCents(config.payoutMinimum)
			});

			await Promise.allSettled(
				preview.map((p) =>
					notifyUpcomingPayout({
						affiliateId: p.affiliate_id,
						amount: centsToDollarString(p.cents),
						payoutDate,
						cohortLabel
					})
				)
			);
			return { cohort, notified: preview.length };
		});

		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });
		logger.event('cron_notifyUpcomingAffiliatePayouts_completed', result);
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('notifyUpcomingAffiliatePayouts job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
