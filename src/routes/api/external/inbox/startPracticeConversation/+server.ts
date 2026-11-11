import { error, isHttpError, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { startPracticeConversation } from '$lib/server/inbox/practiceConversation';
import { authenticateUser } from '$lib/server/serverUtils';
import { logger } from '$lib/server/logger';

const bodySchema = z.object({
	timesheetId: z.string().min(1),
	body: z.string().trim().min(1).max(5000)
});

/**
 * A professional messages a practice from one of their timesheets. Opens a
 * conversation, or posts into the one they already have with that practice.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) throw error(400, 'Write a message to send');

		const [candidate] = await db
			.select({ id: candidateProfileTable.id })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);
		if (!candidate) throw error(404, 'Candidate profile not found');

		const result = await startPracticeConversation({
			userId: user.id,
			candidateId: candidate.id,
			timesheetId: parsed.data.timesheetId,
			body: parsed.data.body
		});
		if (!result.ok) throw error(result.status, result.message);

		return json({ conversationId: result.conversationId, created: result.created });
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error('inbox.startPracticeConversation failed', { error: err });
		throw error(500, 'Failed to send message');
	}
};
