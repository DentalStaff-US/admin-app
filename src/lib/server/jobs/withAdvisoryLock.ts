import db from '$lib/server/database/drizzle';

/**
 * Run `fn` only if a Postgres session-level advisory lock for `lockName` is acquired.
 * Returns `null` if another holder already owns the lock — caller should treat
 * that as a no-op (someone else is already doing the work).
 *
 * Use this around cron job handlers that must not overlap themselves (e.g. when
 * a 5-minute job occasionally runs longer than 5 minutes).
 */
export async function tryWithAdvisoryLock<T>(
	lockName: string,
	fn: () => Promise<T>
): Promise<T | null> {
	const client = await db.$client.connect();
	try {
		const { rows } = await client.query<{ locked: boolean }>(
			'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
			[lockName]
		);
		if (!rows[0]?.locked) return null;
		try {
			return await fn();
		} finally {
			await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]);
		}
	} finally {
		client.release();
	}
}
