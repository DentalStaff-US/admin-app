import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { runAffiliatePayouts } from '$lib/server/affiliate/payout';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processAffiliatePayouts', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}
	try {
		const config = await getAffiliateConfig();
		if (!config.programEnabled) {
			logger.info('processAffiliatePayouts skipped — program disabled');
			return json({ success: true, skipped: 'PROGRAM_DISABLED' });
		}

		// The advisory lock is the second of three double-pay defences (the others
		// are UNIQUE(affiliate_id, cohort_month) and Stripe's idempotency key).
		const result = await tryWithAdvisoryLock('affiliate:processPayouts', () =>
			runAffiliatePayouts()
		);

		if (result === null) {
			logger.info('processAffiliatePayouts skipped — lock held');
			return json({ success: true, skipped: 'LOCK_HELD' });
		}

		logger.event('cron_processAffiliatePayouts_completed', {
			cohort: result.cohort,
			affiliates_considered: result.affiliatesConsidered,
			paid: result.paid,
			rolled_forward: result.rolledForward,
			skipped: result.skipped,
			failed: result.failed,
			total_paid: result.totalPaidCents / 100
		});

		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processAffiliatePayouts job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
