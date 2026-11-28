import { logger } from '$lib/server/logger';
import { failed, ok, type Metric } from '../types';

/**
 * Run one dashboard query; a throw becomes `{ ok: false }` (rendered "—") and is
 * logged, instead of the old `.catch(() => 0)` that showed a confident zero (10 §2.2).
 */
export async function settle<T>(name: string, run: () => Promise<T>): Promise<Metric<T>> {
	try {
		return ok(await run());
	} catch (error) {
		logger.error(`dashboard: ${name} failed`, { error });
		return failed<T>();
	}
}
