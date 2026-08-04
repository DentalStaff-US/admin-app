import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { METERS_PER_MILE } from '$lib/config/constants';
import { getDefaultSearchRadius } from '$lib/server/database/queries/config';
import { clientIsActiveCondition } from '$lib/server/clientStatusGuards';
import { logger } from '$lib/server/logger';
import { requisitionTable, workdayTable } from '$lib/server/database/schemas/requisition';
import { maskLocation } from '$lib/server/privacy/clientIdentity';

export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	try {
		const { miles: radiusMiles, meters: radiusMeters } = await getDefaultSearchRadius();
		// Fetch the candidate's profile
		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			throw error(404, 'Candidate profile not found');
		}

		// Non-active candidates (pending/inactive/denied) can't see locations.
		if (candidateProfile.status !== 'ACTIVE') {
			return json({ officeLocations: [], totalFound: 0, accountStatus: candidateProfile.status });
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
			.innerJoin(
				clientCompanyTable,
				eq(clientCompanyTable.id, companyOfficeLocationTable.companyId)
			)
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.where(
				and(
					isNotNull(companyOfficeLocationTable.geom),
					// Owning business must be ACTIVE.
					clientIsActiveCondition,
					// Filter by distance using ST_DWithin for performance
					sql`ST_DWithin(
            ${companyOfficeLocationTable.geom}::geography,
            ST_SetSRID(ST_MakePoint(${candidateProfile.lon}::float, ${candidateProfile.lat}::float), 4326)::geography,
            ${radiusMeters}
          )`
				)
			).orderBy(sql`ST_Distance(
        ${companyOfficeLocationTable.geom}::geography,
        ST_SetSRID(ST_MakePoint(${candidateProfile.lon}::float, ${candidateProfile.lat}::float), 4326)::geography
      )`);

		// Only practices the candidate actually works at are named here; the rest
		// are city/distance only, same rule as the shift listings.
		const heldLocations = await db
			.select({ locationId: requisitionTable.locationId })
			.from(workdayTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
			.where(
				and(eq(workdayTable.candidateId, candidateProfile.id), isNull(workdayTable.cancelledAt))
			);
		const unlockedLocationIds = new Set(heldLocations.map((row) => row.locationId));

		const visibleLocations = officeLocations.map((location) =>
			unlockedLocationIds.has(location.id)
				? { ...location, identityLocked: false }
				: {
						...maskLocation(location, location.id),
						companyId: null,
						identityLocked: true
					}
		);

		return json({
			candidateLocation: {
				lat: candidateProfile.lat,
				lon: candidateProfile.lon,
				address: candidateProfile.completeAddress
			},
			officeLocations: visibleLocations,
			searchRadius: radiusMiles,
			totalFound: visibleLocations.length
		});
	} catch (err) {
		logger.error('getNearbyLocationsForCandidate failed', { error: err, distinctId: user?.id });
		throw error(500, 'Internal server error');
	}
};
