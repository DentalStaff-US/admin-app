import { scheduleJob, scheduledJobs, RecurrenceRule } from 'node-schedule';
import { API_URL, CRON_SECRET } from '$env/static/private';
import crypto from 'crypto';

export const processTimesheetCreationJob = () => {
	const rule = new RecurrenceRule();
	rule.minute = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]; // every 5 minutes
	rule.tz = 'America/New_York';

	return scheduleJob('processTimesheetCreation', rule, async function (fireDate) {
		const timestamp = fireDate.toISOString();
		const signature = crypto.createHmac('sha256', CRON_SECRET).digest('hex');

		try {
			console.log(`Starting processTimesheetCreationJob - ${fireDate}`);

			const result = await fetch(`${API_URL}/jobs/timesheets/processTimesheetCreation`, {
				method: 'GET',
				headers: {
					'X-Timestamp': timestamp,
					'X-Signature': signature
				}
			});

			if (!result.ok) {
				const errorText = await result.text();
				throw new Error(`API returned error status ${result.status}: ${errorText}`);
			}

			const data = await result.json();
			console.log(
				`Processed ${data.created || 0} new timesheets, linked ${data.linked || 0} workdays`
			);
		} catch (error) {
			console.error('Error processing timesheet creation:', error);
		} finally {
			console.log(`Finished processTimesheetCreationJob - ${fireDate}`);
		}
	});
};
