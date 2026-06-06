import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { logger } from '$lib/server/logger';
import {
	autoApproveTimesheets,
	findTimesheetsToAutoApprove
} from '$lib/server/timesheets/timesheetAutoApproval';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processTimesheetAutoApproval', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	const result = await tryWithAdvisoryLock('processTimesheetAutoApproval', async () => {
		try {
			const candidates = await findTimesheetsToAutoApprove(new Date());
			if (candidates.length === 0) {
				return json({ success: true, noop: true });
			}

			const { approved, skipped } = await autoApproveTimesheets(candidates);
			return json({
				success: true,
				approved: approved.length,
				skipped: skipped.length,
				noop: approved.length === 0
			});
		} catch (error) {
			logger.error('processTimesheetAutoApproval job failed', { error });
			return json({ success: false, error: String(error) }, { status: 500 });
		}
	});

	if (result === null) {
		return json({
			success: true,
			skipped: true,
			message: 'processTimesheetAutoApproval is already running; skipping this tick'
		});
	}
	return result;
};
