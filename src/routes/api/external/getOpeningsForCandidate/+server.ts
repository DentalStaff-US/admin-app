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
import {
	requisitionApplicationTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { disciplineTable, experienceLevelTable } from '$lib/server/database/schemas/skill';
import { authenticateUser } from '$lib/server/serverUtils';
import { type RequestHandler, error, json } from '@sveltejs/kit';
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm';
import { METERS_PER_MILE } from '$lib/config/constants';
import { getDefaultSearchRadius } from '$lib/server/database/queries/config';
import { clientIsActiveCondition } from '$lib/server/clientStatusGuards';
import { logger } from '$lib/server/logger';
import { credentialSelectFields } from '$lib/server/certifications/credentialGateSql';
import { splitByCredentialEligibility } from '$lib/server/certifications/credentialStatus';
import { checkCandidateQualified } from '$lib/server/qualifyCandidate';
import { wantsPermanentWork, workPreferenceExclusionReason } from '$lib/server/workPreference';
import {
	isApplicationUnlocked,
	maskLocation,
	maskedCompany,
	roundDistanceMiles
} from '$lib/server/privacy/clientIdentity';

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

		// Work-type preference gate — the mirror of the one in
		// getTempRequisitionsForCandidate. This endpoint IS the permanent openings
		// board (`permanent_position = true`), so a professional who said "temp only"
		// gets an empty list plus the reason.
		//
		// wantsPermanentWork(), never `preference === 'PERMANENT'`: NULL means never
		// answered, which means show everything. See $lib/server/workPreference.
		if (!wantsPermanentWork(candidate.workPreference)) {
			return json({
				requisitions: [],
				totalFound: 0,
				workPreference: {
					preference: candidate.workPreference,
					excluded: workPreferenceExclusionReason(candidate.workPreference, 'PERMANENT')
				}
			});
		}

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
				experienceLevelOrder: experienceLevelTable.order,
				// Rate is not enforced for permanent (see above), but the shared
				// qualification helper needs the fields present; `enforceRate: false`
				// below means they are never read.
				preferredHourlyMin: candidateDisciplineExperienceTable.preferredHourlyMin,
				preferredHourlyMax: candidateDisciplineExperienceTable.preferredHourlyMax,
				disciplineName: disciplineTable.name,
				abbreviation: disciplineTable.abbreviation,
				...credentialSelectFields()
			})
			.from(candidateDisciplineExperienceTable)
			.innerJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.innerJoin(
				disciplineTable,
				eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId)
			)
			.where(eq(candidateDisciplineExperienceTable.candidateId, candidate.id));

		if (candidateDisciplines.length === 0) {
			throw error(400, 'No discipline experience found. Please update your profile.');
		}

		// Drop disciplines whose certification/registration has lapsed. Only EXPIRED
		// is removed; MISSING and NOT_REQUIRED stay visible (see certStatus.ts).
		// The 400 above is deliberately left for the genuinely-no-disciplines case —
		// telling someone to "update your profile" when their licence expired would
		// point them at the wrong thing.
		const { eligible: eligibleDisciplines, certLocked } =
			splitByCredentialEligibility(candidateDisciplines);

		if (eligibleDisciplines.length === 0) {
			// Empty list WITH `certLocked`, not a 400: the candidate app renders a
			// banner naming the lapsed discipline, whereas an error would surface as a
			// generic load failure that explains nothing.
			return json({
				candidateLocation: {
					lat: candidate.lat,
					lon: candidate.lon,
					address: candidate.completeAddress
				},
				requisitions: [],
				searchRadius: radiusMiles,
				totalFound: 0,
				certLocked
			});
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
				// This candidate's own application, if any — an APPROVED one is what
				// unlocks the practice's identity on a permanent posting.
				applicationStatus: requisitionApplicationTable.status,
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
			.leftJoin(
				requisitionApplicationTable,
				and(
					eq(requisitionApplicationTable.requisitionId, requisitionTable.id),
					eq(requisitionApplicationTable.candidateId, candidate.id)
				)
			)
			.where(
				and(
					inArray(requisitionTable.locationId, nearbyOfficeLocationIds),
					eq(requisitionTable.status, 'OPEN'),
					eq(requisitionTable.archived, false),
					eq(requisitionTable.permanentPosition, true),
					// Owning business must be ACTIVE.
					clientIsActiveCondition,
					// Exclude companies that have blacklisted this candidate (symmetric).
					sql`NOT EXISTS (
						SELECT 1 FROM candidate_blacklists cb
						WHERE cb.candidate_id = ${candidate.id}
						AND cb.company_id = ${requisitionTable.companyId}
					)`,
					// Ensure the requisition's discipline matches one of the candidate's disciplines
					inArray(
						requisitionTable.disciplineId,
						eligibleDisciplines.map((d) => d.disciplineId)
					)
				)
			).orderBy(sql`ST_Distance(
        ${companyOfficeLocationTable.geom}::geography,
        ST_SetSRID(ST_MakePoint(${candidate.lon}::float, ${candidate.lat}::float), 4326)::geography
      )`);

		// Reductive experience-level filter (perm), now via the shared predicate
		// instead of a third hand-rolled copy of it. `enforceRate: false` reproduces
		// this endpoint's prior behaviour exactly: perm rate semantics differ from
		// temp hourly and were never gated here. The certification check inside the
		// helper is belt-and-braces — the `inArray` above already excluded lapsed
		// disciplines — but it keeps one definition of "qualified" for all callers.
		const qualified = requisitions.filter(
			(req) =>
				checkCandidateQualified(
					eligibleDisciplines,
					{
						disciplineId: req.disciplineId,
						experienceLevelOrder: req.experienceLevelOrder,
						hourlyRate: null
					},
					{ enforceRate: false }
				).qualified
		);

		// Mask the practice on every posting the candidate hasn't been approved for.
		const visibleRequisitions = qualified.map((req) => {
			if (isApplicationUnlocked({ status: req.applicationStatus })) {
				return { ...req, identityLocked: false };
			}
			return {
				...req,
				title: null,
				company: maskedCompany,
				location: maskLocation(
					{ ...req.location, distanceMiles: req.distanceMiles },
					req.location?.id ?? `req-${req.id}`
				),
				// Top-level distance is what the list card reads — keep it, bucketed.
				distanceMiles: roundDistanceMiles(req.distanceMiles),
				identityLocked: true
			};
		});

		return json({
			candidateLocation: {
				lat: candidate.lat,
				lon: candidate.lon,
				address: candidate.completeAddress
			},
			requisitions: visibleRequisitions,
			searchRadius: radiusMiles,
			totalFound: visibleRequisitions.length,
			nearbyOfficeCount: nearbyOfficeLocationIds.length,
			// Reported even when openings were found: a two-discipline professional
			// who lost one still needs telling.
			certLocked,
			workPreference: {
				preference: candidate.workPreference,
				excluded: workPreferenceExclusionReason(candidate.workPreference, 'PERMANENT')
			}
		});
	} catch (err) {
		logger.error('getOpeningsForCandidate failed', { error: err, distinctId: user?.id });
		throw error(500, 'Internal server error');
	}
};
