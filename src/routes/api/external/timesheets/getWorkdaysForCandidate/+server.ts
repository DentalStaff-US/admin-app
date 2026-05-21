import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	workdayTable,
	recurrenceDayTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import { authenticateUser } from '$lib/server/serverUtils';
import { eq, and } from 'drizzle-orm';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json({ success: false, message: 'Unauthorized' }, { status: 401 });
		}

		const candidateProfile = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1)
			.then((rows) => rows[0]);

		if (!candidateProfile) {
			return json({ success: false, message: 'Candidate profile not found' }, { status: 404 });
		}

		const workdays = await db
			.select({
				id: workdayTable.id,
				recurrenceDayId: workdayTable.recurrenceDayId,
				date: recurrenceDayTable.date,
				startTime: recurrenceDayTable.dayStart,
				endTime: recurrenceDayTable.dayEnd,
				requisitionId: workdayTable.requisitionId,
				companyId: requisitionTable.companyId,
				companyName: clientCompanyTable.companyName
			})
			.from(workdayTable)
			.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
			.innerJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.where(eq(workdayTable.candidateId, candidateProfile.id));

		return json({
			success: true,
			data: { workdays }
		});
	} catch (err) {
		logger.error('timesheets.getWorkdaysForCandidate failed', { error: err });
		return json({ success: false, message: 'Internal server error' }, { status: 500 });
	}
};
