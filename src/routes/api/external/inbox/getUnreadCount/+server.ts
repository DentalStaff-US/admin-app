import { InboxService } from '$lib/server/inbox';
import { logger } from '$lib/server/logger';
import { authenticateUser } from '$lib/server/serverUtils';
import { error, isHttpError, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		return json({ unreadCount: await new InboxService().getTotalUnreadCount(user.id) });
	} catch (err) {
		if (isHttpError(err)) throw err;
		logger.error('inbox.getUnreadCount failed', { error: err });
		throw error(500, 'Internal server error');
	}
};
