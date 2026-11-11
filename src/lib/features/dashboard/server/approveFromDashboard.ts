/**
 * Inline "Approve" from Needs attention / Waiting on you (10 §3.1, §4.1).
 *
 * Unlike the timesheet page's action, this one re-checks the caller's scope against
 * the timesheet before approving: practice → same client and an in-scope location,
 * plus the approveTimesheets capability. Only PENDING timesheets (no discrepancy)
 * can be approved inline; anything else goes through the timesheet page.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { USER_ROLES } from '$lib/config/constants';
import db from '$lib/server/database/drizzle';
import { requisitionTable, timeSheetTable } from '$lib/server/database/schemas/requisition';
import { approveAndInvoiceTimesheet } from '$lib/server/timesheets/approveTimesheet';
import { logger } from '$lib/server/logger';
import { canApproveInline } from '../scope';
import type { DashboardScope } from '../types';
import { adminScope, resolveClientScope } from './scope';

const REASONS: Record<string, string> = {
	PENDING_EXPENSES: 'Some expenses still need review. Open the timesheet to finish.',
	UNFINISHED_WORKDAYS: "Some shifts this week haven't ended yet, so the hours can't be approved.",
	ZERO_AMOUNT: 'The invoice amount would be $0. Open the timesheet to check the hours and rate.',
	NO_STRIPE_CUSTOMER: "This practice's billing isn't set up yet. Open the timesheet for details.",
	NO_REQUISITION: 'The requisition this timesheet belongs to no longer exists.',
	NOT_FOUND: 'Timesheet not found.',
	NOT_PENDING: 'This timesheet is no longer waiting for approval.'
};

export async function approveFromDashboard(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) return fail(401, { error: 'Sign in again to approve.' });

	const form = await event.request.formData();
	const timesheetId = String(form.get('timesheetId') ?? '');
	if (!timesheetId) return fail(400, { error: 'Missing timesheet.' });

	let scope: DashboardScope;
	if (user.role === USER_ROLES.SUPERADMIN) {
		scope = adminScope();
	} else if (user.role === USER_ROLES.CLIENT || user.role === USER_ROLES.CLIENT_STAFF) {
		const resolved = await resolveClientScope(user);
		if (!resolved) return fail(403, { error: 'Not allowed.' });
		scope = resolved.scope;
	} else {
		return fail(403, { error: 'Not allowed.' });
	}

	const [target] = await db
		.select({
			clientId: timeSheetTable.associatedClientId,
			status: timeSheetTable.status,
			locationId: requisitionTable.locationId
		})
		.from(timeSheetTable)
		.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
		.where(eq(timeSheetTable.id, timesheetId))
		.limit(1);

	if (!target || !canApproveInline(scope, target)) {
		return fail(403, { error: 'You can’t approve this timesheet from here. Open it to review.' });
	}

	try {
		const result = await approveAndInvoiceTimesheet(timesheetId, { actorUserId: user.id });
		if (result.ok) return { approved: timesheetId };
		const message =
			result.reason === 'PENDING_EXPENSES'
				? `${result.pendingExpenseCount} expense(s) still need review. Open the timesheet to finish.`
				: (REASONS[result.reason] ?? 'Couldn’t approve. The timesheet was left unchanged.');
		return fail(result.reason === 'ERROR' ? 500 : 400, { error: message });
	} catch (e) {
		logger.error('dashboard: inline approve failed', { error: e, timesheetId });
		return fail(500, { error: 'Couldn’t approve. The timesheet was left unchanged.' });
	}
}
