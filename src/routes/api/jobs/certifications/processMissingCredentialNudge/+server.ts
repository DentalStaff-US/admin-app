import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { runMissingCredentialNudge } from '$lib/server/certifications/certReminders';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processMissingCredentialNudge', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	// `?dryRun=1` reports who the job WOULD reach, writing nothing and sending
	// nothing. Still signature-gated, so it is no more exposed than the real run.
	// This exists because the only other way to answer "is this working?" before a
	// Tuesday is to wait for one.
	const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

	try {
		const result = await tryWithAdvisoryLock('certifications:missingCredentialNudge', () =>
			runMissingCredentialNudge({ dryRun })
		);

		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });
		if (dryRun) return json({ success: true, dryRun: true, ...result });
		if (result.matched === 0) return json({ success: true, noop: true });

		logger.event('cron_processMissingCredentialNudge_completed', result);
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processMissingCredentialNudge job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
