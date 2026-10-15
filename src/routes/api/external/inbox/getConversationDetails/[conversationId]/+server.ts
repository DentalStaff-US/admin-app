import { InboxService } from '$lib/server/inbox';
import { authenticateUser } from '$lib/server/serverUtils';
import type { RequestHandler } from './$types';
import { error, isHttpError, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { conversationParticipantsTable } from '$lib/server/database/schemas/messages';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request, params }) => {
	try {
		const user = await authenticateUser(request);
		const { conversationId } = params;

		// Only participants may read a thread. Previously any authenticated user with
		// a conversation id got the whole thing — messages, participants' contact
		// details and any linked company. Mirrors the check in sendMessage.
		const [participant] = await db
			.select({ userId: conversationParticipantsTable.userId })
			.from(conversationParticipantsTable)
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationId),
					eq(conversationParticipantsTable.userId, user.id),
					eq(conversationParticipantsTable.isActive, true)
				)
			)
			.limit(1);

		if (!participant) {
			throw error(403, 'User is not an active participant in this conversation');
		}

		const inboxService = new InboxService();

		const conversations = await inboxService.getConversationDetails(conversationId, user.id);

		return json(conversations);
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error('inbox.getConversationDetails failed', {
			error: err,
			conversationId: params.conversationId
		});
		throw error(500, 'Internal server error');
	}
};
