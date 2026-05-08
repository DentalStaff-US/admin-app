import db from '$lib/server/database/drizzle';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm';
import { METERS_PER_MILE, RADIUS_METERS, RADIUS_MILES } from '$lib/config/constants';

export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	try {
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

		// Check if candidate has location coordinates
		if (!candidate.lat || !candidate.lon) {
			throw error(
				400,
				'Candidate location coordinates not found. Please update your profile with your address.'
			);
		}

		// Fetch candidate's disciplines. Permanent listings are exploratory
		// (job-board style) — we only filter by discipline (and location/status
		// in the SQL below). Experience level + rate are NOT enforced for
		// permanent; admins review applicants individually.
		const candidateDisciplines = await db
			.select({ disciplineId: candidateDisciplineExperienceTable.disciplineId })
			.from(candidateDisciplineExperienceTable)
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
            ${RADIUS_METERS}
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
				searchRadius: RADIUS_MILES,
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
				title: requisitionTable.title,
				status: requisitionTable.status,
				hourlyRate: requisitionTable.hourlyRate,
				disciplineId: requisitionTable.disciplineId,
				experienceLevelId: requisitionTable.experienceLevelId,
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
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.where(
				and(
					inArray(requisitionTable.locationId, nearbyOfficeLocationIds),
					eq(requisitionTable.status, 'OPEN'),
					eq(requisitionTable.archived, false),
					eq(requisitionTable.permanentPosition, true),
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

		return json({
			candidateLocation: {
				lat: candidate.lat,
				lon: candidate.lon,
				address: candidate.completeAddress
			},
			requisitions,
			searchRadius: RADIUS_MILES,
			totalFound: requisitions.length,
			nearbyOfficeCount: nearbyOfficeLocationIds.length
		});
	} catch (err) {
		console.error('Error fetching requisitions:', err);
		throw error(500, 'Internal server error');
	}
};
