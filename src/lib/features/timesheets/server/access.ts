/**
 * Ownership check for the practice-facing timesheet actions (approve, reject,
 * the approval survey, approve/reject expense). The page load was scoped but
 * these actions only checked the role, so a practice user could act on another
 * practice's timesheet by posting its id. Mirrors the load: owners must own the
 * timesheet's practice; staff must too, and also have its location.
 *
 * Unknown or not-yours both answer 404, so ids can't be probed.
 */
import { error } from '@sveltejs/kit';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { USER_ROLES } from '$lib/config/constants';
import {
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import {
	getRequisitionById,
	getTimesheetById,
	getTimesheetExpenseById
} from '$lib/server/database/queries/requisitions';
import { assertCanAccessLocation } from '$lib/server/scoping';

type Actor = { id: string; role: string };

export async function assertTimesheetActionAccess(
	user: Actor,
	timesheetId: string,
	{ expenseId }: { expenseId?: string } = {}
): Promise<void> {
	const timesheet = await getTimesheetById(timesheetId);
	if (!timesheet) throw error(404, 'Timesheet not found');

	// The expense must belong to this timesheet, for everyone (admins included),
	// so the URL's timesheet is the one actually being acted on.
	if (expenseId !== undefined) {
		const expense = await getTimesheetExpenseById(expenseId);
		if (!expense || expense.timesheetId !== timesheetId) throw error(404, 'Expense not found');
	}

	if (checkIsAdmin(user.role)) return;

	if (user.role === USER_ROLES.CLIENT) {
		const client = await getClientProfilebyUserId(user.id);
		if (!client || timesheet.associatedClientId !== client.id)
			throw error(404, 'Timesheet not found');
		return;
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		if (!client || timesheet.associatedClientId !== client.id)
			throw error(404, 'Timesheet not found');
		const requisition = timesheet.requisitionId
			? await getRequisitionById(timesheet.requisitionId)
			: null;
		await assertCanAccessLocation(user, requisition?.locationId);
		return;
	}

	throw error(403, 'Forbidden');
}
