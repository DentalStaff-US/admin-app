import { authenticateUser } from '$lib/server/serverUtils';
import { recordView } from '$lib/server/audit/audit';
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
import {
	findPracticeConversationId,
	isBlockedFromPractice
} from '$lib/server/inbox/practiceConversation';

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

export const GET: RequestHandler = async ({ request, params }) => {
	// Authenticate user
	const user = await authenticateUser(request);
	if (!user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401, headers: corsHeaders });
	}

	const { id } = params;

	if (!id) {
		return json(
			{ success: false, message: 'Invalid request' },
			{ status: 400, headers: corsHeaders }
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

	const [workday] = await db
		.select({
			workday: { ...workdayTable },
			recurrenceDay: { ...recurrenceDayTable },
			// The professional's own sheet for this shift, and only what the page needs:
			// the full row carries admin fee columns.
			timesheet: {
				id: timeSheetTable.id,
				status: timeSheetTable.status,
				totalHoursWorked: timeSheetTable.totalHoursWorked,
				adjustedHourlyRate: timeSheetTable.adjustedHourlyRate
			},
			requisition: {
				...requisitionTable,
				companyName: clientCompanyTable.companyName,
				disciplineName: disciplineTable.name
			},
			company: {
				id: clientCompanyTable.id,
				name: clientCompanyTable.companyName,
				logo: clientCompanyTable.companyLogo
			},
			location: {
				...companyOfficeLocationTable
			}
		})
		.from(workdayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.leftJoin(timeSheetTable, eq(timeSheetTable.id, workdayTable.timesheetId))
		.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
		.innerJoin(
			companyOfficeLocationTable,
			eq(requisitionTable.locationId, companyOfficeLocationTable.id)
		)
		.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
		.where(and(eq(workdayTable.id, id), eq(workdayTable.candidateId, candidateProfile.id)));

	if (!workday) {
		return json(
			{ success: false, message: 'Workday not found' },
			{ status: 404, headers: corsHeaders }
		);
	}

	// Keyed by recurrence-day id (not workday id) so it lands on the same
	// timeline the admin workday page reads.
	void recordView({
		entityType: 'RECURRENCE_DAYS',
		entityId: workday.recurrenceDay.id,
		actor: user,
		metadata: {
			workdayId: id,
			requisitionId: workday.requisition.id,
			candidateId: candidateProfile.id
		}
	});

	// Claiming the shift is what opens the line to the practice.
	const [conversationId, practiceBlocked] = await Promise.all([
		findPracticeConversationId({ userId: user.id, companyId: workday.company.id }),
		isBlockedFromPractice({ candidateId: candidateProfile.id, companyId: workday.company.id })
	]);

	return json(
		{
			success: true,
			data: {
				...workday,
				conversationId,
				canMessagePractice: !practiceBlocked && !workday.workday.cancelledAt
			}
		},
		{ headers: corsHeaders }
	);
};
