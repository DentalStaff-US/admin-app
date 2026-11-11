import { redirect } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { approveFromDashboard } from '$lib/features/dashboard/server/approveFromDashboard';
import { loadAdminDashboard } from '$lib/features/dashboard/server/loadAdminDashboard';
import { loadClientDashboard } from '$lib/features/dashboard/server/loadClientDashboard';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// Personalised and acted on: never cache it, or "I approved it but it still
	// says 3" (10 §2.2).
	event.setHeaders({ 'cache-control': 'private, no-store' });
	// The page re-runs this on focus and every minute while visible (10 §6.1).
	event.depends('dashboard:live');

	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');

	if (user.role === USER_ROLES.SUPERADMIN) {
		return { user, dashboard: await loadAdminDashboard(event.url) };
	}
	if (user.role === USER_ROLES.CLIENT || user.role === USER_ROLES.CLIENT_STAFF) {
		return { user, dashboard: await loadClientDashboard(user, event.url) };
	}
	return { user, dashboard: null };
};

export const actions: Actions = {
	approveTimesheet: approveFromDashboard
};
