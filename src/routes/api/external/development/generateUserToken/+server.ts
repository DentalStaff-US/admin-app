import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { generateToken } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { dev } from '$app/environment';

export const POST: RequestHandler = async ({ request }) => {
	// This endpoint mints a JWT for ANY userId with no authentication — it is a
	// local development aid only and must never be reachable in a deployed env.
	if (!dev) {
		throw error(404, 'Not found');
	}
	try {
		const { userId } = await request.json();

		console.log(userId);

		const user = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1);

		if (user.length === 0) {
			throw error(401, 'User not found');
		}

		const token = generateToken(userId);

		return json({ token });
	} catch (err) {
		logger.error('development.generateUserToken failed', { error: err });
		throw error(500, 'Internal server error');
	}
};
