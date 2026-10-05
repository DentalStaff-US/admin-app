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
import {
	effectiveCertExpirySql,
	effectiveLicenseExpirySql,
	licenseGraceStartedOnSql
} from '$lib/server/certifications/credentialGateSql';

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
				// Credential state for this entry. `requiresLicense` is the admin-set
				// requirement; `effectiveExpiry` is MAX(expiry_date) across the credentials
				// linked to it ('YYYY-MM-DD', or null when none is on file). Together these
				// drive the badges and the upload picker — and they are what the Experience
				// & Rates editors must round-trip, since this endpoint prefills them.
				requiresLicense: disciplineTable.requiresLicense,
				// Both tracks. The editors and both credential slots prefill from this —
				// if any field is missing the UI shows a blank and the next save writes
				// the blank back.
				effectiveLicenseExpiry: effectiveLicenseExpirySql(),
				licenseGraceStartedOn: licenseGraceStartedOnSql(),
				requiresCert: candidateDisciplineExperienceTable.requiresCert,
				// Derived from the newest linked CERTIFICATE, exactly like the license
				// side, and exactly what the gate reads. The legacy cert_expires_on
				// column is NOT returned: the slot prefilled from it would show a date
				// the gate does not honour, and the next save wrote that stale value
				// straight back.
				effectiveCertExpiry: effectiveCertExpirySql()
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
