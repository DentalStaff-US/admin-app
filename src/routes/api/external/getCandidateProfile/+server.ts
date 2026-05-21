import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	try {
		// Fetch the candidate's profile
		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			throw error(404, 'Candidate profile not found');
		}

		return json(candidateProfile);
	} catch (err) {
		logger.error('getCandidateProfile failed', { error: err, distinctId: user?.id });
		throw error(500, 'Internal server error');
	}
};
