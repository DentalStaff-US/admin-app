import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { logger } from '$lib/server/logger';
import {
	attachWeeksToTimesheets,
	findUnlinkedWorkdays,
	groupWorkdaysByWeek,
	releaseVoidOrphanedWorkdays
} from '$lib/server/timesheets/timesheetCreation';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processTimesheetCreation', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	const result = await tryWithAdvisoryLock('processTimesheetCreation', async () => {
		try {
			const now = new Date();

			await releaseVoidOrphanedWorkdays();

			const groups = await groupWorkdaysByWeek(await findUnlinkedWorkdays(), now);
			if (groups.length === 0) {
				return json({ success: true, noop: true });
			}

			const { created, linked } = await attachWeeksToTimesheets(groups);
			return json({
				success: true,
				message: `Processed ${groups.length} groups`,
				created,
				linked,
				noop: created === 0
			});
		} catch (error) {
			logger.error('processTimesheetCreation job failed', { error });
			return json({ success: false, error: String(error) }, { status: 500 });
		}
	});

	if (result === null) {
		return json({
			success: true,
			skipped: true,
			message: 'processTimesheetCreation is already running; skipping this tick'
		});
	}
	return result;
};
