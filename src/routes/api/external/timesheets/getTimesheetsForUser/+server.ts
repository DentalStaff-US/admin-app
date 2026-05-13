import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import {
	timeSheetTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { authenticateUser } from '$lib/server/serverUtils';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ request }) => {
	// Authenticate the user
	const user = await authenticateUser(request);

	try {
		// Get the candidate's profile
		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			throw error(404, 'Candidate profile not found');
		}

		// Fetch timesheets with related data
		const timesheets = await db
			.select({
				timesheet: {
					id: timeSheetTable.id,
					createdAt: timeSheetTable.createdAt,
					updatedAt: timeSheetTable.updatedAt,
					validated: timeSheetTable.validated,
					totalHoursWorked: timeSheetTable.totalHoursWorked,
					totalHoursBilled: timeSheetTable.totalHoursBilled,
					awaitingClientSignature: timeSheetTable.awaitingClientSignature,
					weekBeginDate: timeSheetTable.weekBeginDate,
					hoursRaw: timeSheetTable.hoursRaw,
					status: timeSheetTable.status,
					discrepancyNote: timeSheetTable.discrepancyNote
				},
				requisition: {
					id: requisitionTable.id,
					title: requisitionTable.title,
					status: requisitionTable.status,
					referenceTimezone: requisitionTable.referenceTimezone,
					disciplineName: disciplineTable.name
				},
				company: {
					id: clientCompanyTable.id,
					name: clientCompanyTable.companyName,
					logo: clientCompanyTable.companyLogo
				}
			})
			.from(timeSheetTable)
			.leftJoin(requisitionTable, eq(timeSheetTable.requisitionId, requisitionTable.id))
			.leftJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.where(eq(timeSheetTable.associatedCandidateId, candidateProfile.id))
			.orderBy(timeSheetTable.weekBeginDate);

		return json({ success: true, data: timesheets });
	} catch (err) {
		console.error('Error fetching timesheets:', err);
		throw error(500, 'Internal server error');
	}
};
