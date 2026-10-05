import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { runCertExpiryAdminDigest } from '$lib/server/certifications/certReminders';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processCertExpiryAdminDigest', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const result = await tryWithAdvisoryLock('certifications:expiryDigest', () =>
			runCertExpiryAdminDigest()
		);

		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });
		// Nothing in any of the five sections — stay quiet rather than mailing an
		// empty digest and logging a completion event every week.
		if (!result.sent) return json({ success: true, noop: true });

		logger.event('cron_processCertExpiryAdminDigest_completed', result);
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processCertExpiryAdminDigest job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
