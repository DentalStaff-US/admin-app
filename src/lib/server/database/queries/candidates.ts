import {
	asc,
	desc,
	eq,
	count,
	sql,
	or,
	ilike,
	and,
	ne,
	lt,
	inArray,
	exists,
	isNotNull,
	type SQLWrapper
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import db from '$lib/server/database/drizzle';
import { userTable, type User } from '../schemas/auth';
import {
	candidateDisciplineExperienceTable,
	candidateDocumentUploadsTable,
	candidateProfileTable,
	type CandidateProfile,
	type UpdateCandidateProfile
} from '../schemas/candidate';
import { disciplineTable, experienceLevelTable, type Discipline } from '../schemas/skill';
import {
	DEFAULT_MAX_RECORD_LIMIT,
	CANDIDATE_STATUS,
	type CandidateStatus
} from '$lib/config/constants';
import { error } from '@sveltejs/kit';
import {
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable,
	workdayTable
} from '../schemas/requisition';
import { clientCompanyTable, companyOfficeLocationTable } from '../schemas/client';
import { candidateDocumentUploadSchema, documentResultSchema } from '$lib/config/zod-schemas';
import { getDefaultSearchRadius } from './config';
import type { ProfessionalFilters, DisciplineSummary } from '$lib/_helpers/professional-filters';

export type { ProfessionalFilters, DisciplineSummary };

export type CandidateWithProfile = {
	user: User;
	profile: CandidateProfile;
	discipline: Discipline;
};

export type CandidateWithProfileRaw = {
	address: string | null;
	avatar_url: string | null;
	avg_rating: number;
	birthday: string | null;
	blacklisted: boolean;
	candidate_id: string;
	candidate_status: string;
	cell_phone: string | null;
	citizenship: string | null;
	city: string | null;
	completed_onboarding: boolean;
	created_at: string | null;
	discipline_abbreviation: string | null;
	discipline_id: string | null;
	discipline_name: string | null;
	email: string;
	employee_number: string | null;
	experience_level_id: null;
	feature_me: false;
	first_name: string;
	hourly_rate_max: number | null;
	hourly_rate_min: number | null;
	id: string;
	last_name: string;
	provider: string;
	provider_id: string;
	receive_email: boolean;
	role: string;
	state: string | null;
	token: string | null;
	updated_at: string;
	user_id: string;
	verified: boolean;
	zipcode: string | null;
	lat: string | null;
	lon: string | null;
	complete_address: string | null;
};

export type CandidateStatusCounts = Record<CandidateStatus, number>;

const emptyStatusCounts = (): CandidateStatusCounts => ({
	ACTIVE: 0,
	PENDING: 0,
	INACTIVE: 0,
	DENIED: 0
});

export async function getCandidateStatusCounts(): Promise<CandidateStatusCounts> {
	const rows = await db
		.select({ status: candidateProfileTable.status, value: count() })
		.from(candidateProfileTable)
		.groupBy(candidateProfileTable.status);

	const counts = emptyStatusCounts();
	for (const row of rows) {
		if (row.status && row.status in counts) {
			counts[row.status as CandidateStatus] = Number(row.value);
		}
	}
	return counts;
}

/** Which filter dimension to leave out — used to build facet-aware option lists. */
type FilterDimension = 'discipline' | 'city' | 'state' | 'zipcode';

/**
 * Discipline predicates MUST be EXISTS subqueries rather than join-level WHERE
 * clauses. The list query aggregates every discipline a professional holds; if
 * we filtered the join instead, filtering by one discipline would also shrink
 * that aggregate and the row would render only the matched chip.
 */
function disciplineNameMatches(term: string) {
	const filterCde = alias(candidateDisciplineExperienceTable, 'filter_cde');
	const filterDiscipline = alias(disciplineTable, 'filter_discipline');

	// The predicate is built here, against the alias. Taking a prebuilt clause
	// from the caller silently referenced the unaliased `disciplines` table:
	// harmless-looking in the list query (where `disciplines` IS joined, so it
	// bound to the outer row and quietly changed the meaning), but a hard
	// "invalid reference to FROM-clause entry" in the facet queries, which have
	// no such join.
	return exists(
		db
			.select({ one: sql`1` })
			.from(filterCde)
			.innerJoin(filterDiscipline, eq(filterCde.disciplineId, filterDiscipline.id))
			.where(
				and(
					eq(filterCde.candidateId, candidateProfileTable.id),
					or(ilike(filterDiscipline.name, term), ilike(filterDiscipline.abbreviation, term))
				)
			)
	);
}

function disciplineIdExists(disciplineIds: string[]) {
	const filterCde = alias(candidateDisciplineExperienceTable, 'filter_cde');

	return exists(
		db
			.select({ one: sql`1` })
			.from(filterCde)
			.where(
				and(
					eq(filterCde.candidateId, candidateProfileTable.id),
					inArray(filterCde.disciplineId, disciplineIds)
				)
			)
	);
}

/**
 * Builds the WHERE conditions for the professionals list. `exclude` omits one
 * dimension so each facet list can be counted against every *other* active
 * filter (selecting a state narrows the city options, but not the state ones).
 */
function buildProfessionalFilterConditions(
	filters: ProfessionalFilters,
	exclude?: FilterDimension
): SQLWrapper[] {
	const conditions: SQLWrapper[] = [];
	const { search, status, disciplineIds, cities, states, zipcodes } = filters;

	if (status && status in CANDIDATE_STATUS) {
		conditions.push(eq(candidateProfileTable.status, status));
	}

	if (search) {
		const term = `%${search}%`;
		const searchClauses: SQLWrapper[] = [
			ilike(userTable.firstName, term),
			ilike(userTable.lastName, term),
			ilike(userTable.email, term),
			ilike(candidateProfileTable.address, term),
			ilike(candidateProfileTable.city, term),
			ilike(candidateProfileTable.state, term),
			ilike(candidateProfileTable.zipcode, term),
			ilike(candidateProfileTable.completeAddress, term),
			disciplineNameMatches(term)
		];

		// Match phone numbers regardless of formatting: "(555) 123-4567",
		// "555-123-4567" and "5551234567" all normalize to the same digits.
		const digits = search.replace(/\D/g, '');
		if (digits.length >= 3) {
			searchClauses.push(
				sql`regexp_replace(coalesce(${candidateProfileTable.cellPhone}, ''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`}`
			);
		}

		const searchFilter = or(...searchClauses);
		if (searchFilter) conditions.push(searchFilter);
	}

	if (exclude !== 'discipline' && disciplineIds?.length) {
		conditions.push(disciplineIdExists(disciplineIds));
	}
	if (exclude !== 'city' && cities?.length) {
		conditions.push(inArray(candidateProfileTable.city, cities));
	}
	if (exclude !== 'state' && states?.length) {
		conditions.push(inArray(candidateProfileTable.state, states));
	}
	if (exclude !== 'zipcode' && zipcodes?.length) {
		conditions.push(inArray(candidateProfileTable.zipcode, zipcodes));
	}

	return conditions;
}

export async function getAllCandidateProfiles(filters: ProfessionalFilters = {}) {
	const conditions = buildProfessionalFilterConditions(filters);

	const [statusCounts, results] = await Promise.all([
		getCandidateStatusCounts(),
		db
			.select({
				user: {
					id: userTable.id,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					email: userTable.email,
					avatarUrl: userTable.avatarUrl
				},
				// Explicit column list — the previous `{ ...candidateProfileTable }` spread
				// serialized ssnLast4, geom, puid and workersCompCode to the browser.
				profile: {
					id: candidateProfileTable.id,
					userId: candidateProfileTable.userId,
					status: candidateProfileTable.status,
					cellPhone: candidateProfileTable.cellPhone,
					address: candidateProfileTable.address,
					city: candidateProfileTable.city,
					state: candidateProfileTable.state,
					zipcode: candidateProfileTable.zipcode,
					completeAddress: candidateProfileTable.completeAddress,
					createdAt: candidateProfileTable.createdAt
				},
				disciplines: sql<DisciplineSummary[]>`
					coalesce(
						jsonb_agg(distinct jsonb_build_object(
							'id', ${disciplineTable.id},
							'name', ${disciplineTable.name},
							'abbreviation', ${disciplineTable.abbreviation}
						)) filter (where ${disciplineTable.id} is not null),
						'[]'::jsonb
					)`.as('disciplines')
			})
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.leftJoin(
				candidateDisciplineExperienceTable,
				eq(candidateDisciplineExperienceTable.candidateId, candidateProfileTable.id)
			)
			.leftJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.where(conditions.length ? and(...conditions) : undefined)
			// Both are primary keys, so every other selected column is functionally
			// dependent and needs no explicit grouping.
			.groupBy(candidateProfileTable.id, userTable.id)
			// PENDING is a work queue, not a directory: staff triage newest sign-ups
			// first, so that tab defaults to most-recent-first. Every other status is
			// browsed by name and stays alphabetical. `id` breaks createdAt ties so
			// the order is stable across reloads. Clicking a column header still
			// re-sorts client-side either way.
			.orderBy(
				...(filters.status === CANDIDATE_STATUS.PENDING
					? [desc(candidateProfileTable.createdAt), desc(candidateProfileTable.id)]
					: [asc(sql`lower(${userTable.lastName})`), asc(sql`lower(${userTable.firstName})`)])
			)
	]);

	const candidates = results.map((res) => ({
		profile: res.profile,
		user: res.user,
		// jsonb_agg(distinct ...) orders by jsonb comparison (id first), so sort
		// for display here.
		disciplines: (res.disciplines ?? [])
			.slice()
			.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
	}));

	return {
		candidates,
		count: candidates.length,
		statusCounts
	};
}

export type ProfessionalFacetOption = {
	value: string;
	label: string;
	count: number;
};

export type ProfessionalFacets = {
	disciplines: ProfessionalFacetOption[];
	cities: ProfessionalFacetOption[];
	states: ProfessionalFacetOption[];
	zipcodes: ProfessionalFacetOption[];
};

const FACET_LIMIT = 500;

/**
 * Option lists for the filter dropdowns, counted against the currently active
 * filters minus the dimension being listed. Keeps combinations that would
 * return zero rows out of the menus.
 */
export async function getProfessionalFilterFacets(
	filters: ProfessionalFilters = {}
): Promise<ProfessionalFacets> {
	const distinctCandidates = sql<number>`count(distinct ${candidateProfileTable.id})`;

	const columnFacet = async (
		column:
			| typeof candidateProfileTable.city
			| typeof candidateProfileTable.state
			| typeof candidateProfileTable.zipcode,
		dimension: FilterDimension
	): Promise<ProfessionalFacetOption[]> => {
		const conditions = buildProfessionalFilterConditions(filters, dimension);
		const rows = await db
			.select({ value: column, total: distinctCandidates })
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.where(and(...conditions, isNotNull(column), ne(column, '')))
			.groupBy(column)
			.orderBy(desc(distinctCandidates), asc(column))
			.limit(FACET_LIMIT);

		return rows
			.filter((row): row is { value: string; total: number } => Boolean(row.value))
			.map((row) => ({ value: row.value, label: row.value, count: Number(row.total) }));
	};

	const disciplineFacet = async (): Promise<ProfessionalFacetOption[]> => {
		const conditions = buildProfessionalFilterConditions(filters, 'discipline');
		const rows = await db
			.select({
				value: disciplineTable.id,
				name: disciplineTable.name,
				abbreviation: disciplineTable.abbreviation,
				total: distinctCandidates
			})
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.innerJoin(
				candidateDisciplineExperienceTable,
				eq(candidateDisciplineExperienceTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.where(conditions.length ? and(...conditions) : undefined)
			.groupBy(disciplineTable.id)
			.orderBy(asc(disciplineTable.name))
			.limit(FACET_LIMIT);

		return rows.map((row) => ({
			value: row.value,
			label: row.name,
			count: Number(row.total)
		}));
	};

	const [disciplines, cities, states, zipcodes] = await Promise.all([
		disciplineFacet(),
		columnFacet(candidateProfileTable.city, 'city'),
		columnFacet(candidateProfileTable.state, 'state'),
		columnFacet(candidateProfileTable.zipcode, 'zipcode')
	]);

	return { disciplines, cities, states, zipcodes };
}

export async function getCandidateUserById(candidateId: string) {
	const [result] = await db
		.select({
			id: userTable.id,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			email: userTable.email,
			avatarUrl: userTable.avatarUrl
		})
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.where(eq(candidateProfileTable.id, candidateId));
	if (!result) throw error(404, 'Candidate Not Found');
	return result;
}

export async function getCandidateProfileById(candidateId: string) {
	const [result] = await db
		.select({
			profile: { ...candidateProfileTable },
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				receiveEmail: userTable.receiveEmail,
				receiveSms: userTable.receiveSms
			}
		})
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, candidateId))
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id));

	const disciplines = await db
		.select({
			discipline: { ...disciplineTable },
			experience: {
				...candidateDisciplineExperienceTable,
				experienceLevel: experienceLevelTable.value
			},
			salaryRange: {
				min: candidateDisciplineExperienceTable.preferredHourlyMin,
				max: candidateDisciplineExperienceTable.preferredHourlyMax
			}
		})
		.from(candidateDisciplineExperienceTable)
		.innerJoin(
			disciplineTable,
			eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
		)
		.innerJoin(
			experienceLevelTable,
			eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
		)
		.where(eq(candidateDisciplineExperienceTable.candidateId, candidateId));

	if (!result) throw error(404, 'Candidate Not Found');
	return { candidate: result, disciplines: disciplines || [] };
}

export async function getCandidateProfileByUserId(userId: string) {
	const [result] = await db
		.select()
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.userId, userId));

	if (!result) throw error(404, 'Candidate Not Found');

	return result;
}

export async function getCandidatesByStatus(status: keyof typeof CANDIDATE_STATUS) {
	const result = await db
		.select({
			profile: { ...candidateProfileTable },
			user: {
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			},
			discipline: { ...disciplineTable }
		})
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.status, status));

	return result;
}

export async function getCandidateByEmail(email: string) {
	// Match the user by email (case-insensitive — addresses are stored as
	// entered) and join through to their candidate profile. The previous
	// version referenced userTable in the where clause without joining it,
	// which produced invalid SQL and never returned a match.
	const [result] = await db
		.select({
			profile: { ...candidateProfileTable },
			user: {
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			}
		})
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(sql`lower(${userTable.email}) = ${email.toLowerCase()}`)
		.limit(1);

	if (!result) throw error(404, 'Candidate Not Found');

	return result;
}

export const createCandidateProfile = async (data: CandidateProfile, tx?: any) => {
	try {
		const query = tx || db;
		const [result] = await query.insert(candidateProfileTable).values(data).returning();
		return result;
	} catch (err) {
		console.error(err);
		throw new Error(err instanceof Error ? err.message : 'Error updating candidate profile');
	}
};

export async function updateCandidateProfile(candidateId: string, data: UpdateCandidateProfile) {
	const [result] = await db
		.update(candidateProfileTable)
		.set(data)
		.where(eq(candidateProfileTable.id, candidateId))
		.returning();

	if (!result) throw error(404, 'Candidate Not Found');

	return result;
}

export function deleteCandidateProfileByUid(userId: string) {}

export function deleteCandidateProfileById(candidateId: string) {}

export function updateCandidateStatus(candidateId: string, status: typeof CANDIDATE_STATUS) {}

export async function getAllCandidateWorkHistory(candidateId: string) {
	const workdays = await db
		.select({
			workday: { ...workdayTable },
			recurrenceDay: { ...recurrenceDayTable },
			requisition: {
				...requisitionTable,
				companyName: clientCompanyTable.companyName
			},
			location: {
				name: companyOfficeLocationTable.name,
				address1: companyOfficeLocationTable.streetOne,
				address2: companyOfficeLocationTable.streetTwo,
				city: companyOfficeLocationTable.city,
				state: companyOfficeLocationTable.state,
				zip: companyOfficeLocationTable.zipcode
			},
			timesheet: { ...timeSheetTable }
		})
		.from(workdayTable)
		.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
		.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
		.innerJoin(
			companyOfficeLocationTable,
			eq(requisitionTable.locationId, companyOfficeLocationTable.id)
		)
		.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
		.leftJoin(timeSheetTable, eq(timeSheetTable.id, workdayTable.timesheetId))
		.where(and(eq(workdayTable.candidateId, candidateId), isNotNull(timeSheetTable.id)));

	return workdays || [];
}

export async function getCandidateWorkHistoryForClient(candidateId: string, clientId: string) {}

export async function getCandidateDocuments(candidateId: string) {
	const documents = await db
		.select()
		.from(candidateDocumentUploadsTable)
		.where(eq(candidateDocumentUploadsTable.candidateId, candidateId))
		.orderBy(desc(candidateDocumentUploadsTable.createdAt))
		.limit(DEFAULT_MAX_RECORD_LIMIT);

	return documents || [];
}

export async function uploadCandidateDocuments(data: unknown, candidateId: string | SQLWrapper) {
	try {
		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.id, candidateId));

		if (!candidateProfile) {
			throw new Error('Candidate profile not found');
		}

		const parsedData = documentResultSchema.safeParse(data);

		if (!parsedData.success) {
			throw new Error('Invalid data');
		}
		const fileData = parsedData.data;

		if (fileData) {
			const candidateDocuments = fileData.map((file: { url: string; filename: string }) => ({
				candidateId: candidateProfile.id,
				type: 'OTHER' as const,
				uploadUrl: file.url,
				createdAt: new Date(),
				updatedAt: new Date(),
				id: crypto.randomUUID(),
				filename: file.filename
			}));
			return await db.insert(candidateDocumentUploadsTable).values(candidateDocuments);
		}
	} catch (error) {
		console.log(error);
		throw new Error(error instanceof Error ? error.message : 'Error uploading documents');
	}
}

export async function getQualifiedProfessionalsForRequisition(
	requisition: any,
	location: any,
	options: { includeAllExperience?: boolean; includeOutsidePayRange?: boolean } = {}
) {
	try {
		// Get location coordinates
		const locationLat = location.lat;
		const locationLon = location.lon;

		if (!locationLat || !locationLon) {
			console.warn('Location has no coordinates, cannot find nearby candidates');
			return [];
		}

		// Required discipline ID from requisition
		const requiredDisciplineId = requisition.disciplineId;
		// Search radius is sourced from admin_config (Application Settings page).
		const { miles: radiusMiles, meters: radiusMeters } = await getDefaultSearchRadius();

		// Resolve the requisition's experience-level "order" for reductive filtering:
		// `candidate.order >= required.order` (higher experience cascades to lower
		// requirements). Skip the filter entirely when the requisition has no level
		// (null id == "no preference") or when the caller passed `includeAllExperience`
		// (the "Show more" link in the assign modal).
		let requiredOrder: number | null = null;
		if (requisition.experienceLevelId && !options.includeAllExperience) {
			const [requiredLevel] = await db
				.select({ order: experienceLevelTable.order })
				.from(experienceLevelTable)
				.where(eq(experienceLevelTable.id, requisition.experienceLevelId))
				.limit(1);
			requiredOrder = requiredLevel?.order ?? null;
		}

		// Pay-range filter: the requisition's posted rate must fall within the
		// candidate's preferred range FOR THIS DISCIPLINE (preferred_hourly_min/max
		// on candidate_discipline_experience). This mirrors gate #3 in
		// `checkCandidateQualified` (qualifyCandidate.ts) — the single source of
		// truth for what a candidate can see/apply to. Without it the admin list
		// and the new-workdays notification blast over-include candidates who
		// price themselves out of the shift and therefore never see it.
		//
		// Skipped when the requisition has no rate (malformed/permanent — nothing
		// to compare against) or when the caller opts into the extended search
		// ("Show more"), which intentionally ignores the pay range.
		const requisitionRate: number | null =
			typeof requisition.hourlyRate === 'number' ? requisition.hourlyRate : null;
		const applyPayFilter = requisitionRate !== null && !options.includeOutsidePayRange;

		// Query candidates using PostGIS ST_DWithin and ST_Distance
		const candidates = await db
			.select({
				// Candidate info
				candidateId: candidateProfileTable.id,
				userId: candidateProfileTable.userId,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				phoneNumber: candidateProfileTable.cellPhone,

				// Profile info
				address: candidateProfileTable.completeAddress,
				city: candidateProfileTable.city,
				state: candidateProfileTable.state,
				lat: candidateProfileTable.lat,
				lon: candidateProfileTable.lon,
				hourlyRateMin: candidateProfileTable.hourlyRateMin,
				hourlyRateMax: candidateProfileTable.hourlyRateMax,
				avgRating: candidateProfileTable.avgRating,
				approved: candidateProfileTable.approved,
				status: candidateProfileTable.status,

				// Discipline/Experience
				disciplineId: candidateDisciplineExperienceTable.disciplineId,
				disciplineName: disciplineTable.name,
				disciplineAbbr: disciplineTable.abbreviation,
				experienceLevelId: candidateDisciplineExperienceTable.experienceLevelId,
				experienceLevelOrder: experienceLevelTable.order,
				// Per-discipline preferred rate range — the authoritative pay range
				// used for qualification (NOT the profile-level hourlyRateMin/Max above).
				preferredHourlyMin: candidateDisciplineExperienceTable.preferredHourlyMin,
				preferredHourlyMax: candidateDisciplineExperienceTable.preferredHourlyMax,

				// Calculate distance in miles using PostGIS
				// ST_Distance returns meters, convert to miles
				distance: sql<number>`
					ST_Distance(
						${candidateProfileTable.geom}::geography,
						ST_SetSRID(ST_MakePoint(${locationLon}, ${locationLat}), 4326)::geography
					) * 0.000621371
				`.as('distance')
			})
			.from(candidateProfileTable)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.innerJoin(
				candidateDisciplineExperienceTable,
				eq(candidateDisciplineExperienceTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(
				disciplineTable,
				eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId)
			)
			.innerJoin(
				experienceLevelTable,
				eq(experienceLevelTable.id, candidateDisciplineExperienceTable.experienceLevelId)
			)
			.where(
				and(
					// Must have the required discipline
					eq(candidateDisciplineExperienceTable.disciplineId, requiredDisciplineId),
					// Reductive experience-level filter: candidate level order must be >=
					// required level order. Skipped when requisition has no level (null).
					requiredOrder !== null
						? sql`${experienceLevelTable.order} >= ${requiredOrder}`
						: undefined,
					// Reductive pay-range filter: posted rate within the candidate's
					// preferred range for this discipline. Mirrors checkCandidateQualified
					// (reject when rate < min OR rate > max). Skipped for the extended
					// search and when the requisition has no rate.
					applyPayFilter
						? sql`${requisitionRate} >= ${candidateDisciplineExperienceTable.preferredHourlyMin} AND ${requisitionRate} <= ${candidateDisciplineExperienceTable.preferredHourlyMax}`
						: undefined,
					// Must be approved/active. `approved` is kept in sync with status
					// via updateStatus, so checking status alone is the source of truth.
					eq(candidateProfileTable.status, 'ACTIVE'),
					// Must have geometry point
					isNotNull(candidateProfileTable.geom),
					// Exclude candidates blacklisted from this requisition's company.
					// Symmetric blacklist: keeps them out of the assign UI and the
					// new-workday notification blast for this company.
					sql`NOT EXISTS (
						SELECT 1 FROM candidate_blacklists cb
						WHERE cb.candidate_id = ${candidateProfileTable.id}
						AND cb.company_id = ${requisition.companyId}
					)`,
					// Within 50 miles using PostGIS ST_DWithin (uses spatial index!)
					sql`ST_DWithin(
						${candidateProfileTable.geom}::geography,
						ST_SetSRID(ST_MakePoint(${locationLon}, ${locationLat}), 4326)::geography,
						${radiusMeters}
					)`
				)
			)
			.orderBy(sql`distance ASC`); // Closest first

		console.log(`Found ${candidates.length} qualified candidates within ${radiusMiles} miles`);

		return candidates.map((c) => ({
			...c,
			distance: Number(c.distance).toFixed(1) // Format distance to 1 decimal
		}));
	} catch (error) {
		console.error('Error finding qualified professionals:', error);
		return [];
	}
}
