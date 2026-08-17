import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { workdayTable } from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { eq } from 'drizzle-orm';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
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

		// Get unique companies from workdays claimed by the candidate
		const companies = await db
			.selectDistinct({
				id: requisitionTable.companyId,
				name: clientCompanyTable.companyName,
				logoUrl: clientCompanyTable.companyLogo
			})
			.from(workdayTable)
			.innerJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.where(eq(workdayTable.candidateId, candidateProfile.id));

		return json({ success: true, data: { companies } });
	} catch (err) {
		logger.error('timesheets.getCompaniesForCandidate failed', { error: err });
		return json({ success: false, message: 'Internal server error' }, { status: 500 });
	}
};
