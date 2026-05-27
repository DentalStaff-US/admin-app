import {
	desc,
	eq,
	count,
	sql,
	or,
	ilike,
	and,
	ne,
	lt,
	isNotNull,
	type SQLWrapper
} from 'drizzle-orm';
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

export async function getAllCandidateProfiles(
	searchTerm?: string,
	status?: CandidateStatus
) {
	const statusCounts = await getCandidateStatusCounts();
	const filters: SQLWrapper[] = [];

	if (status && status in CANDIDATE_STATUS) {
		filters.push(eq(candidateProfileTable.status, status));
	}

	if (searchTerm) {
		const searchFilter = or(
			ilike(userTable.firstName, `%${searchTerm}%`),
			ilike(userTable.lastName, `%${searchTerm}%`),
			ilike(userTable.email, `%${searchTerm}%`),
			ilike(disciplineTable.name, `%${searchTerm}%`),
			ilike(candidateProfileTable.address, `%${searchTerm}%`),
			ilike(candidateProfileTable.city, `%${searchTerm}%`),
			ilike(candidateProfileTable.state, `%${searchTerm}%`)
		);
		if (searchFilter) filters.push(searchFilter);
	}

	const results = await db
		.selectDistinctOn([candidateProfileTable.id], {
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl
			},
			profile: { ...candidateProfileTable },
			discipline: { ...disciplineTable }
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
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(candidateProfileTable.id), desc(candidateProfileTable.createdAt));

	return {
		candidates: results.map((res) => ({
			profile: res.profile,
			user: res.user,
			discipline: res.discipline
		})),
		count: statusCounts[status ?? CANDIDATE_STATUS.ACTIVE] ?? results.length,
		statusCounts
	};
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
				avatarUrl: userTable.avatarUrl
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
	const [result] = await db
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
		.where(eq(userTable.email, email));

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
	options: { includeAllExperience?: boolean } = {}
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
					// Must be approved/active. `approved` is kept in sync with status
					// via updateStatus, so checking status alone is the source of truth.
					eq(candidateProfileTable.status, 'ACTIVE'),
					// Must have geometry point
					isNotNull(candidateProfileTable.geom),
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
