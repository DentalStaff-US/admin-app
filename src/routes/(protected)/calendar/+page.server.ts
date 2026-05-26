import { USER_ROLES } from '$lib/config/constants.js';
import { getCalendarEventsForAdmin } from '$lib/server/database/queries/admin';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import {
	getCalendarEventsForClient,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import { redirect } from '@sveltejs/kit';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';

export const load = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	if (user.role === USER_ROLES.SUPERADMIN) {
		const events = await getCalendarEventsForAdmin(user.id);

		return {
			user,
			events
		};
	}

	if (user?.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const profile = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(profile.id, user.role);

		const events = await getCalendarEventsForClient(profile.id);

		return {
			user,
			events
		};
	}

	if (user?.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);

		const scopedLocationIds = await getClientStaffScopedLocationIds(user);
		const events = await getCalendarEventsForClient(client?.id, scopedLocationIds);

		console.log(events);

		return {
			user,
			events
		};
	}

	return {
		user,
		events: []
	};
};
