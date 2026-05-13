import * as dotenv from 'dotenv';
dotenv.config();

import schedule, { RecurrenceRule, scheduleJob, gracefulShutdown } from 'node-schedule';
import { jobs, type JobDefinition } from '../lib/server/jobs/registry';
import { executeJob } from '../lib/server/jobs/execute';
import { logger, shutdownPostHog } from './logger';

const CRON_SECRET = process.env.CRON_SECRET;
const API_URL = process.env.API_URL;

if (!CRON_SECRET) {
	logger.error('CRON_SECRET is not set — refusing to start');
	process.exit(1);
}
if (!API_URL) {
	logger.error('API_URL is not set — refusing to start');
	process.exit(1);
}

const inFlight = new Set<string>();

function buildRule(def: JobDefinition): RecurrenceRule {
	const partial = def.rule();
	const rule = new RecurrenceRule();
	Object.assign(rule, partial);
	return rule;
}

function register(def: JobDefinition) {
	if (def.enabled === false) {
		logger.info(`skipping disabled job: ${def.name} (${def.schedule})`);
		return;
	}
	const rule = buildRule(def);
	scheduleJob(def.name, rule, async (fireDate) => {
		if (inFlight.has(def.name)) {
			logger.warn(`${def.name} previous run still in flight — skipping tick`, {
				fireDate: fireDate.toISOString()
			});
			logger.event('cron_job_skipped', { jobName: def.name, fireDate: fireDate.toISOString() });
			return;
		}
		inFlight.add(def.name);
		const startedAt = Date.now();
		logger.info(`${def.name} → POST ${def.endpoint}`, { fireDate: fireDate.toISOString() });
		try {
			const res = await executeJob(def.name, def.endpoint, {
				baseUrl: API_URL!,
				secret: CRON_SECRET!
			});
			if (!res.ok) {
				logger.error(`${def.name} failed`, {
					jobName: def.name,
					status: res.status,
					durationMs: res.durationMs,
					error: res.error,
					body: JSON.stringify(res.body).slice(0, 500)
				});
				logger.event('cron_job_failed', {
					jobName: def.name,
					status: res.status,
					durationMs: res.durationMs,
					error: res.error
				});
			} else {
				logger.info(`${def.name} ok`, {
					status: res.status,
					durationMs: res.durationMs
				});
				logger.event('cron_job_completed', {
					jobName: def.name,
					status: res.status,
					durationMs: res.durationMs
				});
			}
		} catch (error) {
			logger.error(`${def.name} threw`, { error, jobName: def.name });
			logger.event('cron_job_failed', { jobName: def.name, error: String(error) });
		} finally {
			inFlight.delete(def.name);
			logger.info(`${def.name} done`, { totalWallMs: Date.now() - startedAt });
		}
	});
	logger.info(`registered ${def.name} — ${def.schedule}`);
}

for (const def of jobs) register(def);

logger.info(`${Object.keys(schedule.scheduledJobs).length} job(s) scheduled`, { apiUrl: API_URL });

let shuttingDown = false;
async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info(`received ${signal}, draining in-flight jobs...`);
	try {
		await gracefulShutdown();
		logger.info('drained cleanly');
	} catch (error) {
		logger.error('gracefulShutdown error', { error });
	}
	try {
		await shutdownPostHog();
	} catch (error) {
		// last-resort console — logger.error itself would try PostHog
		console.error('[cron] failed to shutdown PostHog', error);
	}
	process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
	logger.error('unhandledRejection', { error: reason });
});
process.on('uncaughtException', (error) => {
	logger.error('uncaughtException', { error });
});
