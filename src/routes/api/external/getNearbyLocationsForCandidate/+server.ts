import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { METERS_PER_MILE, RADIUS_METERS, RADIUS_MILES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	try {
		// Fetch the candidate's profile
		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			throw error(404, 'Candidate profile not found');
		}

		if (!candidateProfile.lat || !candidateProfile.lon) {
			throw error(400, 'Candidate location coordinates not found');
		}

		// Fetch office locations within 30 miles using PostGIS
		const officeLocations = await db
			.select({
				id: companyOfficeLocationTable.id,
				companyId: companyOfficeLocationTable.companyId,
				name: companyOfficeLocationTable.name,
				completeAddress: companyOfficeLocationTable.completeAddress,
				city: companyOfficeLocationTable.city,
				state: companyOfficeLocationTable.state,
				zipcode: companyOfficeLocationTable.zipcode,
				companyPhone: companyOfficeLocationTable.companyPhone,
				email: companyOfficeLocationTable.email,
				// Calculate distance in miles
				distanceMiles: sql<number>`ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${candidateProfile.lon}::float, ${candidateProfile.lat}::float), 4326)::geography
        ) / ${METERS_PER_MILE}`
			})
			.from(companyOfficeLocationTable)
			.where(
				and(
					isNotNull(companyOfficeLocationTable.geom),
					// Filter by distance using ST_DWithin for performance
					sql`ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${candidateProfile.lon}::float, ${candidateProfile.lat}::float), 4326)::geography,
            ${RADIUS_METERS}
          )`
				)
			).orderBy(sql`ST_Distance(
        geom::geography,
        ST_SetSRID(ST_MakePoint(${candidateProfile.lon}::float, ${candidateProfile.lat}::float), 4326)::geography
      )`);

		return json({
			candidateLocation: {
				lat: candidateProfile.lat,
				lon: candidateProfile.lon,
				address: candidateProfile.completeAddress
			},
			officeLocations,
			searchRadius: RADIUS_MILES,
			totalFound: officeLocations.length
		});
	} catch (err) {
		logger.error('getNearbyLocationsForCandidate failed', { error: err, distinctId: user?.id });
		throw error(500, 'Internal server error');
	}
};
