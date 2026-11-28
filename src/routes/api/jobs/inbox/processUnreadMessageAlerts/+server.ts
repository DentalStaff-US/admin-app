import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { runUnreadMessageAlerts } from '$lib/server/inbox/unreadAlerts';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processUnreadMessageAlerts', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const result = await tryWithAdvisoryLock('inbox:unreadAlerts', () => runUnreadMessageAlerts());

		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });
		if (!result.recipients) return json({ success: true, noop: true });

		logger.event('cron_processUnreadMessageAlerts_completed', result);
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processUnreadMessageAlerts job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
