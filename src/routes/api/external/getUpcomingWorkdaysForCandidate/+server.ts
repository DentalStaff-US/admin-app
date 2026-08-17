import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import {
	clientCompanyTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { disciplineTable } from '$lib/server/database/schemas/skill';

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

export const GET: RequestHandler = async ({ request }) => {
	// Authenticate user
	const user = await authenticateUser(request);
	// console.log('User attempting to claim shift:', { userId: user.id });
	if (!user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401, headers: corsHeaders });
	}

	const [candidateProfile] = await db
		.select()
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.userId, user.id));

	if (!candidateProfile) {
		return json(
			{ success: false, message: 'Candidate profile not found' },
			{ status: 404, headers: corsHeaders }
		);
	}

	const todayStr = new Date();

	const workdays = await db
		.select({
			workday: { ...workdayTable },
			company: { ...clientCompanyTable },
			recurrenceDay: { ...recurrenceDayTable },
			requisition: {
				...requisitionTable,
				companyName: clientCompanyTable.companyName,
				// `discipline` is the legacy alias; `disciplineName` matches the
				// pattern used by every other requisition-returning endpoint.
				// Both are populated so existing consumers don't break while
				// the rename rolls forward.
				discipline: disciplineTable.name,
				disciplineName: disciplineTable.name
			},
			location: {
				name: companyOfficeLocationTable.name,
				address1: companyOfficeLocationTable.streetOne,
				address2: companyOfficeLocationTable.streetTwo,
				city: companyOfficeLocationTable.city,
				state: companyOfficeLocationTable.state,
				zip: companyOfficeLocationTable.zipcode
			},
			timesheet: { ...timeSheetTable }
		})
		.from(workdayTable)
		.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
		.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
		.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
		.innerJoin(
			companyOfficeLocationTable,
			eq(requisitionTable.locationId, companyOfficeLocationTable.id)
		)
		.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
		.leftJoin(timeSheetTable, eq(timeSheetTable.id, workdayTable.timesheetId))
		.where(
			and(
				eq(workdayTable.candidateId, candidateProfile.id),
				gte(recurrenceDayTable.dayStart, todayStr),
				// Cancelled shifts (incl. those cleared by a blacklist) drop off.
				isNull(workdayTable.cancelledAt),
				// Belt-and-suspenders: hide any future shift for a company that
				// has since blacklisted this candidate.
				sql`NOT EXISTS (
						SELECT 1 FROM candidate_blacklists cb
						WHERE cb.candidate_id = ${candidateProfile.id}
						AND cb.company_id = ${requisitionTable.companyId}
					)`
			)
		)
		// Soonest shift first. Without this the candidate dashboard rendered rows
		// in whatever order the join happened to emit — which is not just
		// unsorted but unstable between requests. `workday.id` breaks ties so two
		// shifts starting at the same instant keep a fixed order.
		.orderBy(asc(recurrenceDayTable.dayStart), asc(workdayTable.id));

	return json({ success: true, data: workdays }, { headers: corsHeaders });
};
