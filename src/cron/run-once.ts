/**
 * Trigger ONE scheduled job right now, the same way the cron service does
 * (signed POST to API_URL). For local testing and one-off ops runs.
 *
 *   npm run job -- processSignatureRequests
 *
 * Needs CRON_SECRET and API_URL (from .env), and the web app running at API_URL.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { jobs } from '../lib/server/jobs/registry';
import { executeJob } from '../lib/server/jobs/execute';

const name = process.argv[2];
const { CRON_SECRET, API_URL } = process.env;

if (!name) {
	console.error('Usage: npm run job -- <jobName>\n\nJobs:\n' + jobs.map((j) => `  ${j.name}`).join('\n'));
	process.exit(1);
}
const job = jobs.find((j) => j.name === name);
if (!job) {
	console.error(`Unknown job "${name}". Run without arguments to list jobs.`);
	process.exit(1);
}
if (!CRON_SECRET || !API_URL) {
	console.error('CRON_SECRET and API_URL must be set (see sample.env).');
	process.exit(1);
}

const result = await executeJob(job.name, job.endpoint, { baseUrl: API_URL, secret: CRON_SECRET });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
