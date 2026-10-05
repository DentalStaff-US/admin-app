import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { runCertExpiryReminders } from '$lib/server/certifications/certReminders';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processCertExpiryReminders', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		// The ledger's unique index already makes a double run a no-op, but the lock
		// avoids two instances racing to claim-and-send and burning SMS credits.
		const result = await tryWithAdvisoryLock('certifications:expiryReminders', () =>
			runCertExpiryReminders()
		);

		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });
		if (result.scanned === 0) return json({ success: true, noop: true });

		logger.event('cron_processCertExpiryReminders_completed', result);
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processCertExpiryReminders job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
