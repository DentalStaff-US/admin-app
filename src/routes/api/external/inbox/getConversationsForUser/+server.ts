import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { InboxService } from '$lib/server/inbox';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			throw error(404, 'Candidate profile not found');
		}

		const inboxService = new InboxService();

		const conversations = await inboxService.getConversations(user.id);

		return json(conversations);
	} catch (err) {
		logger.error('inbox.getConversationsForUser failed', { error: err });
		throw error(500, 'Internal server error');
	}
};
