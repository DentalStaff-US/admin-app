import { USER_ROLES } from '$lib/config/constants.js';
import { getClientStaffProfilebyUserId } from '$lib/server/database/queries/clients.js';
import { InboxService } from '$lib/server/inbox';
import { logger } from '$lib/server/logger';
import { parseSidebarState, SIDEBAR_COOKIE } from '$lib/nav/nav';

export const load = async (event) => {
	const user = event.locals.user;
	// Surfaced to the layout so it can render the "viewing as" bar.
	const impersonating = Boolean(event.locals.session?.impersonatedBy);
	// Read here so the first paint already has the right sidebar width.
	const sidebar = parseSidebarState(event.cookies.get(SIDEBAR_COOKIE));

	// The sidebar's Inbox badge. Re-run after reading a thread via
	// invalidate('app:unread'). A failure shows no badge rather than an error page.
	event.depends('app:unread');
	const unreadCount = user
		? await new InboxService().getTotalUnreadCount(user.id).catch((error) => {
				logger.error('shell unread count failed', { error, distinctId: user.id });
				return 0;
			})
		: 0;

	const base = { user, impersonating, sidebar, unreadCount };

	if (user?.role === USER_ROLES.CLIENT) {
		return { ...base, isOfficeAdmin: true };
	}

	if (user?.role === USER_ROLES.CLIENT_STAFF) {
		const staffProfile = await getClientStaffProfilebyUserId(user.id);
		return { ...base, isOfficeAdmin: staffProfile.staffRole === 'CLIENT_ADMIN' };
	}

	return { ...base, isOfficeAdmin: false };
};
