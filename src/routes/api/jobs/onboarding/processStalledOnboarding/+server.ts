import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { runStalledOnboardingNudge } from '$lib/server/onboarding/lifecycleNudges';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processStalledOnboarding', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}
	try {
		const result = await runStalledOnboardingNudge();

		// `matched` is the standing size of the abandoned-onboarding cohort, which
		// is the number worth watching over time — `queued` only counts those not
		// currently inside their suppression window.
		logger.event('cron_processStalledOnboarding_completed', {
			stalled_cohort: result.matched,
			queued: result.queued,
			suppressed: result.suppressed
		});

		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processStalledOnboarding job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
