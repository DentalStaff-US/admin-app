import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { reconcileAffiliateFinance } from '$lib/server/affiliate/financeReconcile';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'reconcileAffiliateFinance', CRON_SECRET);
	if (!verified.ok) return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	try {
		const config = await getAffiliateConfig();
		if (!config.programEnabled) return json({ success: true, skipped: 'PROGRAM_DISABLED' });

		// Shares the payout lock: the retry step calls runAffiliatePayouts, which
		// must never overlap the monthly run.
		const result = await tryWithAdvisoryLock('affiliate:processPayouts', () =>
			reconcileAffiliateFinance()
		);
		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });

		logger.event('cron_reconcileAffiliateFinance_completed', {
			connect_synced: result.connectSynced,
			connect_changed: result.connectChanged,
			connect_errors: result.connectErrors,
			failed_payouts_found: result.failedPayoutsFound,
			retry_paid: result.retryRun?.paid ?? 0,
			retry_failed: result.retryRun?.failed ?? 0
		});
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('reconcileAffiliateFinance job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
