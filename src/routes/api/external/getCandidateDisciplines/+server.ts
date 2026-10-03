import { disciplineTable } from './../../../../lib/server/database/schemas/skill';
import { experienceLevelTable } from '$lib/server/database/schemas/skill';
import { candidateDisciplineExperienceTable } from './../../../../lib/server/database/schemas/candidate';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq, ne, and, asc, desc } from 'drizzle-orm';
import { logger } from '$lib/server/logger';
import { effectiveCertExpirySql } from '$lib/server/certifications/certGateSql';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
		const disciplines = await db
			.select({
				disciplineId: disciplineTable.id,
				experienceLevelId: experienceLevelTable.id,
				preferredHourlyMin: candidateDisciplineExperienceTable.preferredHourlyMin,
				preferredHourlyMax: candidateDisciplineExperienceTable.preferredHourlyMax,
				// Labels so the candidate app can render "Dental Hygienist (RDH)" without a
				// second lookup.
				name: disciplineTable.name,
				abbreviation: disciplineTable.abbreviation,
				// Credential state for this entry. `requiresCertification` is the admin-set
				// requirement; `effectiveExpiry` is MAX(expiry_date) across the credentials
				// linked to it ('YYYY-MM-DD', or null when none is on file). Together these
				// drive the badges and the upload picker — and they are what the Experience
				// & Rates editors must round-trip, since this endpoint prefills them.
				requiresCertification: disciplineTable.requiresCertification,
				effectiveExpiry: effectiveCertExpirySql()
			})
			.from(candidateDisciplineExperienceTable)
			.innerJoin(candidateProfileTable, eq(candidateProfileTable.userId, user.id))
			.innerJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.innerJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(
				and(
					eq(candidateProfileTable.userId, user.id),
					eq(candidateDisciplineExperienceTable.candidateId, candidateProfile.id)
				)
			);

		return json({ success: true, disciplines }, { status: 200, headers: corsHeaders });
	} catch (err) {
		logger.error('getCandidateDisciplines failed', { error: err });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
