import { USER_ROLES } from '$lib/config/constants';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import {
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import {
	getAllTimesheetsForClient,
	getAllTimesheetsAdmin,
	getRecurrenceDaysForRequisition,
	getWorkdaysForRecurrenceDays,
	validateTimesheet
} from '$lib/server/database/queries/requisitions';
import { redirect } from '@sveltejs/kit';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';

// In your +page.server.ts
export const load = async (event) => {
	const { locals, url } = event;
	const searchTerm = url.searchParams.get('search') || '';
	const { user } = locals;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	let timesheets: any = [];

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

	const enhancedTimesheets = await Promise.all(
		(timesheets || []).map(async (timesheet) => {
			try {
				// Skip validation for DRAFT or already APPROVED timesheets
				if (timesheet.timesheet.status === 'DRAFT' || timesheet.timesheet.status === 'APPROVED') {
					return {
						...timesheet,
						recurrenceDays: [],
						workdays: [],
						discrepancies: [],
						hasValidationIssues: false
					};
				}

				const recurrenceDays = await getRecurrenceDaysForRequisition(timesheet.requisition?.id);
				const recurrenceDayIds = recurrenceDays?.map((rd) => rd.id) || [];
				const workdays =
					recurrenceDayIds.length > 0 ? await getWorkdaysForRecurrenceDays(recurrenceDayIds) : [];

				return {
					...timesheet,
					recurrenceDays,
					workdays
				};
			} catch (error) {
				console.error(`Error validating timesheet ${timesheet.timesheet.id}:`, error);
				return {
					...timesheet,
					recurrenceDays: [],
					workdays: [],
					discrepancies: []
				};
			}
		})
	);

	return { user, timesheets: enhancedTimesheets, searchTerm };
};
