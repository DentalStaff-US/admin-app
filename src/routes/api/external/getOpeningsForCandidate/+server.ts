import db from '$lib/server/database/drizzle';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { disciplineTable, experienceLevelTable } from '$lib/server/database/schemas/skill';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm';
import { METERS_PER_MILE } from '$lib/config/constants';
import { getDefaultSearchRadius } from '$lib/server/database/queries/config';
import { clientIsActiveCondition } from '$lib/server/clientStatusGuards';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	try {
		const { miles: radiusMiles, meters: radiusMeters } = await getDefaultSearchRadius();
		// Fetch the candidate's profile
		const candidateProfile = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (candidateProfile.length === 0) {
			throw error(404, 'Candidate profile not found');
		}

		const candidate = candidateProfile[0];

		// Non-active candidates (pending/inactive/denied) can't see openings.
		if (candidate.status !== 'ACTIVE') {
			return json({ requisitions: [], totalFound: 0, accountStatus: candidate.status });
		}

		// Check if candidate has location coordinates
		if (!candidate.lat || !candidate.lon) {
			throw error(
				400,
				'Candidate location coordinates not found. Please update your profile with your address.'
			);
		}

		// Fetch candidate's disciplines WITH the order of their experience level.
		// Permanent listings now gate on experience level too (reductive: the
		// candidate's level order must be >= the requisition's required order),
		// so professionals don't see/notified-about perm roles above their level.
		// Rate is intentionally NOT enforced for permanent (perm rate semantics
		// differ from temp hourly); discipline + experience only.
		const candidateDisciplines = await db
			.select({
				disciplineId: candidateDisciplineExperienceTable.disciplineId,
				experienceLevelOrder: experienceLevelTable.order
			})
			.from(candidateDisciplineExperienceTable)
			.innerJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(eq(candidateDisciplineExperienceTable.candidateId, candidate.id));

		if (candidateDisciplines.length === 0) {
			throw error(400, 'No discipline experience found. Please update your profile.');
		}

		// Fetch office locations within the radius using PostGIS
		const nearbyOfficeLocations = await db
			.select({
				id: companyOfficeLocationTable.id,
				distanceMiles: sql<number>`ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${candidate.lon}::float, ${candidate.lat}::float), 4326)::geography
        ) / ${METERS_PER_MILE}`
			})
			.from(companyOfficeLocationTable)
			.where(
				and(
					isNotNull(companyOfficeLocationTable.geom),
					// Filter by distance using ST_DWithin for performance
					sql`ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${candidate.lon}::float, ${candidate.lat}::float), 4326)::geography,
            ${radiusMeters}
          )`
				)
			);

		const nearbyOfficeLocationIds = nearbyOfficeLocations.map((location) => location.id);

		if (nearbyOfficeLocationIds.length === 0) {
			return json({
				candidateLocation: {
					lat: candidate.lat,
					lon: candidate.lon,
					address: candidate.completeAddress
				},
				requisitions: [],
				searchRadius: radiusMiles,
				totalFound: 0,
				message: 'No office locations found within 30 miles of your location.'
			});
		}

		// Fetch requisitions for nearby office locations. Filters: location
		// (within radius), status OPEN, not archived, permanent only,
		// discipline matches one of the candidate's. Experience level and
		// rate range are intentionally NOT applied here — see comment above.
		const requisitions = await db
			.select({
				id: requisitionTable.id,
				// `title` is deprecated — use `disciplineName` for display.
				title: requisitionTable.title,
				disciplineName: disciplineTable.name,
				status: requisitionTable.status,
				hourlyRate: requisitionTable.hourlyRate,
				disciplineId: requisitionTable.disciplineId,
				experienceLevelId: requisitionTable.experienceLevelId,
				experienceLevelOrder: experienceLevelTable.order,
				createdAt: requisitionTable.createdAt,
				permanentPosition: requisitionTable.permanentPosition,
				company: {
					...clientCompanyTable
				},
				location: {
					...companyOfficeLocationTable
				},
				// Include distance to this specific location
				distanceMiles: sql<number>`ST_Distance(
          ${companyOfficeLocationTable.geom}::geography,
          ST_SetSRID(ST_MakePoint(${candidate.lon}::float, ${candidate.lat}::float), 4326)::geography
        ) / ${METERS_PER_MILE}`
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			// Left join so perm reqs with NULL experienceLevelId ("No Preference")
			// are still returned; reductive level filtering happens in-memory below.
			.leftJoin(
				experienceLevelTable,
				eq(requisitionTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(
				and(
					inArray(requisitionTable.locationId, nearbyOfficeLocationIds),
					eq(requisitionTable.status, 'OPEN'),
					eq(requisitionTable.archived, false),
					eq(requisitionTable.permanentPosition, true),
					// Owning business must be ACTIVE.
					clientIsActiveCondition,
					// Ensure the requisition's discipline matches one of the candidate's disciplines
					inArray(
						requisitionTable.disciplineId,
						candidateDisciplines.map((d) => d.disciplineId)
					)
				)
			)
			.orderBy(sql`ST_Distance(
        ${companyOfficeLocationTable.geom}::geography,
        ST_SetSRID(ST_MakePoint(${candidate.lon}::float, ${candidate.lat}::float), 4326)::geography
      )`);

		// Reductive experience-level filter (perm): keep a requisition only when
		// the candidate's level for that discipline is >= the required level, or
		// the requisition has no required level ("No Preference"). Rate is not
		// enforced for perm. Mirrors the temp endpoint's in-memory filter.
		const qualified = requisitions.filter((req) => {
			if (req.experienceLevelOrder === null) return true; // No Preference
			const match = candidateDisciplines.find((d) => d.disciplineId === req.disciplineId);
			const candidateOrder = match?.experienceLevelOrder ?? 0;
			return candidateOrder >= req.experienceLevelOrder;
		});

		return json({
			candidateLocation: {
				lat: candidate.lat,
				lon: candidate.lon,
				address: candidate.completeAddress
			},
			requisitions: qualified,
			searchRadius: radiusMiles,
			totalFound: qualified.length,
			nearbyOfficeCount: nearbyOfficeLocationIds.length
		});
	} catch (err) {
		logger.error('getOpeningsForCandidate failed', { error: err, distinctId: user?.id });
		throw error(500, 'Internal server error');
	}
};
