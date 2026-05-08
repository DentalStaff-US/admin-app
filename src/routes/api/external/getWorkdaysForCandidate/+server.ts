import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
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
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
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

		const workdays = await db
			.select({
				workday: { ...workdayTable },
				recurrenceDay: { ...recurrenceDayTable },
				requisition: {
					...requisitionTable,
					companyName: clientCompanyTable.companyName,
					discipline: disciplineTable.name
				},
				location: {
					name: companyOfficeLocationTable.name,
					completeAddress: companyOfficeLocationTable.completeAddress
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
			.where(eq(workdayTable.candidateId, candidateProfile.id));

		return json({ success: true, data: workdays }, { headers: corsHeaders });
	} catch (err) {
		console.error('Error in GET /api/external/getWorkdaysForCandidate:', err);
		return json(
			{ success: false, message: 'An unexpected error occurred while loading shifts.' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
