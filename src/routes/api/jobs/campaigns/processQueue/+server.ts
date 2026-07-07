import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { logger } from '$lib/server/logger';
import { processCampaignQueue } from '$lib/server/campaigns/processQueue';

// Thin cron shell: verify → lock → delegate to the service → json. All sending
// logic lives in $lib/server/campaigns/processQueue.
export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processCampaignQueue', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	const result = await tryWithAdvisoryLock('processCampaignQueue', async () => {
		try {
			const outcome = await processCampaignQueue();
			return json({ success: true, ...outcome });
		} catch (error) {
			logger.error('processCampaignQueue job failed', { error });
			return json({ success: false, error: String(error) }, { status: 500 });
		}
	});

	if (result === null) {
		return json({
			success: true,
			skipped: true,
			message: 'processCampaignQueue is already running; skipping this tick'
		});
	}
	return result;
};
