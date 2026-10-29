import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { reconcileSignatureRequests } from '$lib/server/signatures/service';
import { runSignatureReminders } from '$lib/server/signatures/reminders';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processSignatureRequests', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const result = await tryWithAdvisoryLock('signatures:processRequests', async () => {
			// Reconcile FIRST: anyone who signed but whose webhook we missed must not
			// get a "please sign" nudge a minute later.
			const reconciled = await reconcileSignatureRequests();
			const reminders = await runSignatureReminders();
			return { reconciled, reminders };
		});

		if (result === null) return json({ success: true, skipped: 'LOCK_HELD' });
		if (result.reconciled.checked === 0 && result.reminders.scanned === 0) {
			return json({ success: true, noop: true });
		}

		logger.event('cron_processSignatureRequests_completed', {
			...result.reconciled,
			...result.reminders
		});
		return json({ success: true, ...result });
	} catch (error) {
		logger.error('processSignatureRequests job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
