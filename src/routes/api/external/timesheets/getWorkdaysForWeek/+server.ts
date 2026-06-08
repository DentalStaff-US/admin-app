import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import {
	workdayTable,
	recurrenceDayTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { addDays } from 'date-fns';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		const weekStartDate = typeof body?.weekStartDate === 'string' ? body.weekStartDate : null;
		const requisitionId = Number(body?.requisitionId);
		// When viewing a specific timesheet, scope to the workdays LINKED to that
		// timesheet rather than the whole week. This is what makes a split-week
		// second timesheet (e.g. just Saturday) show only its own day(s) instead
		// of every day in the week.
		const timesheetId = typeof body?.timesheetId === 'string' ? body.timesheetId : null;

		if (!timesheetId && (!weekStartDate || !Number.isInteger(requisitionId))) {
			return json(
				{
					success: false,
					message: 'Week start date and requisition ID (or timesheet ID) required'
				},
				{ status: 400, headers: corsHeaders }
			);
		}

		// Resolve the candidate profile from the auth'd user so the workday
		// query is scoped to *this* candidate's rows only. Before this guard
		// the endpoint returned workdays for every candidate on the
		// requisition+week, which leaked another candidate's schedule and
		// surfaced rows that didn't belong in the requesting candidate's
		// timesheet UI.
		const [candidateProfile] = await db
			.select({ id: candidateProfileTable.id })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		// Day-scoping: either to the timesheet's own linked workdays (preferred,
		// when timesheetId is given) or to the week's date range (legacy/`_new`
		// flow). Always scoped to the auth'd candidate's own, non-cancelled rows.
		// (Cancelled workdays stay in the DB for calendar visibility but must not
		// surface as enterable rows — hours typed against them would skew totals.)
		const scopeConditions = timesheetId
			? // The timesheet covers a specific set of workdays — return exactly those.
				[eq(workdayTable.timesheetId, timesheetId)]
			: (() => {
					// Caller passes the timesheet's stored `weekBeginDate`; the cron
					// anchors that to Monday so weekEnd is the following Sunday.
					const weekStart = new Date(weekStartDate as string);
					const weekEnd = addDays(weekStart, 6);
					return [
						eq(workdayTable.requisitionId, requisitionId),
						gte(recurrenceDayTable.date, weekStart.toISOString().split('T')[0]),
						lte(recurrenceDayTable.date, weekEnd.toISOString().split('T')[0])
					];
				})();

		const workdays = await db
			.select({
				workday: workdayTable,
				recurrenceDay: recurrenceDayTable,
				requisition: requisitionTable,
				company: clientCompanyTable
			})
			.from(workdayTable)
			.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
			.innerJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.where(
				and(
					eq(workdayTable.candidateId, candidateProfile.id),
					isNull(workdayTable.cancelledAt),
					...scopeConditions
				)
			);

		return json({ success: true, workdays }, { headers: corsHeaders });
	} catch (err) {
		logger.error('timesheets.getWorkdaysForWeek failed', { error: err });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
