import { USER_ROLES } from '$lib/config/constants';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import {
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import {
	getAllTimesheetsForClient,
	getAllTimesheetsAdmin
} from '$lib/server/database/queries/requisitions';
import { redirect } from '@sveltejs/kit';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';
import {
	readTimesheetListQuery,
	shapeTimesheetList,
	toTimesheetListRow
} from '$features/timesheets/timesheetList';

export const load = async (event) => {
	const { locals, url } = event;
	const searchTerm = url.searchParams.get('search') || '';
	const { user } = locals;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	let timesheets: any = [];

	// Scope is unchanged: admins see every sheet; a practice owner sees its
	// client's sheets; client staff only those at their scoped locations.
	if (user.role === USER_ROLES.SUPERADMIN) {
		timesheets = await getAllTimesheetsAdmin(searchTerm);
	} else if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);
		timesheets = await getAllTimesheetsForClient(client?.id, searchTerm);
	} else if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		await redirectIfNotValidCustomer(client?.id, user.role);
		const scopedLocationIds = await getClientStaffScopedLocationIds(user);
		timesheets = await getAllTimesheetsForClient(client?.id, searchTerm, scopedLocationIds);
	}

	// Tab, filters, sort and page come from the URL; voided sheets get their own tab.
	const query = readTimesheetListQuery(url);
	const list = shapeTimesheetList((timesheets || []).map(toTimesheetListRow), query);

	return {
		user,
		isAdmin: user.role === USER_ROLES.SUPERADMIN,
		list,
		query,
		searchTerm
	};
};
