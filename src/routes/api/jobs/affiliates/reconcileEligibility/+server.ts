import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { reconcileAffiliateEligibility } from '$lib/server/affiliate/reconcile';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'reconcileAffiliateEligibility', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}
	try {
		const result = await tryWithAdvisoryLock('affiliate:reconcileEligibility', () =>
			reconcileAffiliateEligibility()
		);

		if (result === null) {
			logger.info('reconcileAffiliateEligibility skipped — lock held');
			return json({ success: true, skipped: 'LOCK_HELD' });
		}

		logger.event('cron_reconcileAffiliateEligibility_completed', {
			scanned: result.scanned,
			changed: result.changed,
			held: result.held,
			reactivated: result.reactivated
		});

		return json({ success: true, ...result });
	} catch (error) {
		logger.error('reconcileAffiliateEligibility job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
