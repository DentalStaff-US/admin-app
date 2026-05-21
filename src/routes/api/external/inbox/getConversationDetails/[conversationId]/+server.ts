import { InboxService } from '$lib/server/inbox';
import { authenticateUser } from '$lib/server/serverUtils';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request, params }) => {
	try {
		const user = await authenticateUser(request);
		const { conversationId } = params;

		const inboxService = new InboxService();

		const conversations = await inboxService.getConversationDetails(conversationId, user.id);

		return json(conversations);
	} catch (err) {
		logger.error('inbox.getConversationDetails failed', { error: err, conversationId: params.conversationId });
		throw error(500, 'Internal server error');
	}
};
