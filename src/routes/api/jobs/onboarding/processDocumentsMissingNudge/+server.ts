import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { runDocumentsMissingNudge } from '$lib/server/onboarding/lifecycleNudges';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processDocumentsMissingNudge', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}
	try {
		const result = await runDocumentsMissingNudge();

		logger.event('cron_processDocumentsMissingNudge_completed', {
			queued: result.queued,
			suppressed: result.suppressed
		});

		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processDocumentsMissingNudge job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
