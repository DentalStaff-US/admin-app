import { desc, eq, count, sql, and, ne, notExists, or, ilike, SQL, inArray, isNotNull } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	clientCompanyTable,
	clientDocumentUploadsTable,
	clientProfileTable,
	clientStaffLocationTable,
	clientStaffProfileTable,
	clientSubscriptionTable,
	companyOfficeLocationTable,
	locationContactDestinationTable,
	type ClientCompany,
	type ClientCompanyLocation,
	type ClientCompanyLocationSelect,
	type ClientProfile,
	type LocationContactDestination,
	type LocationContactDestinationSelect,
	type NewClientCompanyStaffLocation,
	type OperatingHours,
	type UpdateClientProfile
} from '../schemas/client';
import {
	companyStaffInviteLocations,
	userInviteTable,
	userTable,
	type NewUserInvite
} from '../schemas/auth';
import { convertRecurrenceDayToEvent } from '$lib/components/calendar/utils';
import { recurrenceDayTable, requisitionTable } from '../schemas/requisition';
import { error } from '@sveltejs/kit';
import { getSupportTicketsForUserWithLimit } from './support';
import {
	getClientCompanyTimesheetDiscrepancies,
	getClientInvoices,
	getNewApplicationsCount,
	getRecentRequisitionApplications,
	getRecentTimesheetsDueForClient,
	getTimesheetsDueCount
} from './requisitions';
import type { PaginateOptions } from '$lib/types';
import { EmailService } from '$lib/server/email/emailService';
import {
	CLIENT_STATUS,
	DEFAULT_MAX_RECORD_LIMIT,
	type ClientStatus
} from '$lib/config/constants';
import { disciplineTable } from '../schemas/skill';

export type ClientWithCompanyRaw = {
	birthday: string | null;
	company_name: string;
	created_at: Date;
	email: string;
	first_name: string;
	id: string;
	last_name: string;
	updated_at: Date;
	user_id: string;
};
export type ClientResults = ClientWithCompanyRaw[];

export type CompanyLocationRaw = {
	id: string;
	company_id: string;
	created_at: string;
	updated_at: string;
	street_one: string;
	street_two: string;
	city: string;
	state: string;
	zipcode: string;
	company_phone: string;
	cell_phone: string;
	hours_of_operation: string;
	email: string;
	lat: string;
	lon: string;
	timezone: string | null;
	location_name: string;
	complete_address: string;
};

export type LocationsResults = CompanyLocationRaw[];

export type ClientStaffWithLocationRaw = {
	id: string;
	created_at: Date;
	updated_at: Date;
	user_id: string;
	client_id: string;
	company_id: string;
	staff_role: string;
	birthday: string | null;
	first_name: string;
	last_name: string;
	email: string;
	avatar_url: string | null;
	location_name: string;
	is_primary_location: boolean;
	company_name: string;
};

export type ClientStaffResults = ClientStaffWithLocationRaw[];

export type StaffLocation = {
	id: string;
	name: string;
	streetOne: string | null;
	streetTwo: string | null;
	city: string | null;
	state: string | null;
	zipcode: string | null;
	companyPhone: string | null;
	cellPhone: string | null;
	operatingHours: OperatingHours | null;
	email: string | null;
	isPrimary: boolean | null;
	completeAddress: string | null;
	lat: string | null;
	lon: string | null;
};

export async function createClientProfile(values: ClientProfile, tx?: any) {
	const query = tx || db;
	try {
		const [result] = await query
			.insert(clientProfileTable)
			.values(values)
			.onConflictDoNothing()
			.returning();

		return result;
	} catch (error) {
		console.error('Error creating client profile:', error);
		throw error;
	}
}

export async function updateClientProfile(clientId: string, values: UpdateClientProfile) {
	console.log('Executing updateClientProfile, and params', clientId + '\n' + values);
	console.log(values);
	const result = await db
		.update(clientProfileTable)
		.set(values)
		.where(eq(clientProfileTable.id, clientId))
		.returning();

	if (result.length === 0) {
		console.log('El result fue nulitoo', result);
		return null;
	} else {
		console.log('el resultado', result[0]);
		return result[0];
	}
}

export async function updateClientCompany(companyId: string, values: Partial<ClientCompany>) {
	const [result] = await db
		.update(clientCompanyTable)
		.set(values)
		.where(eq(clientCompanyTable.id, companyId))
		.returning();

	return result;
}

// Keep this for backward compatibility if needed elsewhere
export async function getClientProfilesCount() {
	try {
		const result = await db.select({ count: count() }).from(clientProfileTable);

		return result[0]?.count || 0;
	} catch (error) {
		console.error('Error getting client profiles count:', error);
		return 0;
	}
}

export type ClientStatusCounts = Record<ClientStatus, number>;

const emptyClientStatusCounts = (): ClientStatusCounts => ({
	PENDING: 0,
	ACTIVE: 0,
	INACTIVE: 0,
	DENIED: 0
});

export async function getClientStatusCounts(): Promise<ClientStatusCounts> {
	const rows = await db
		.select({ status: clientProfileTable.status, value: count() })
		.from(clientProfileTable)
		.groupBy(clientProfileTable.status);

	const counts = emptyClientStatusCounts();
	for (const row of rows) {
		if (row.status && row.status in counts) {
			counts[row.status as ClientStatus] = Number(row.value);
		}
	}
	return counts;
}

export async function getAllClientProfiles(searchTerm?: string, status?: ClientStatus) {
	const filters: SQL[] = [];

	if (status && status in CLIENT_STATUS) {
		filters.push(eq(clientProfileTable.status, status));
	}

	if (searchTerm) {
		const searchFilter = or(
			ilike(userTable.email, `%${searchTerm}%`),
			ilike(userTable.firstName, `%${searchTerm}%`),
			ilike(userTable.lastName, `%${searchTerm}%`),
			ilike(clientCompanyTable.companyName, `%${searchTerm}%`)
		);
		if (searchFilter) filters.push(searchFilter);
	}

	const results = await db
		.select({
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			},
			profile: { ...clientProfileTable },
			company: { ...clientCompanyTable }
		})
		.from(clientProfileTable)
		.innerJoin(clientCompanyTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.where(filters.length ? and(...filters) : undefined)
		.orderBy(desc(clientProfileTable.createdAt));

	return results;
}

export async function getClientProfileById(clientId: string) {
	const result = await db
		.select({
			profile: { ...clientProfileTable },
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				receiveEmail: userTable.receiveEmail
			},
			company: { ...clientCompanyTable },
			subscription: { ...clientSubscriptionTable }
		})
		.from(clientProfileTable)
		.where(eq(clientProfileTable.id, clientId))
		.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientId))
		.leftJoin(clientSubscriptionTable, eq(clientSubscriptionTable.clientId, clientId));

	return result[0] || null;
}

export async function getClientProfilebyUserId(userId: string | undefined) {
	if (!userId) throw new Error('User ID required');
	const [result] = await db
		.select()
		.from(clientProfileTable)
		.where(eq(clientProfileTable.userId, userId));

	return result || null;
}

export async function getClientIdByCompanyId(companyId: string) {
	try {
		const [company] = await db
			.select({
				clientId: clientCompanyTable.clientId
			})
			.from(clientCompanyTable)
			.where(eq(clientCompanyTable.id, companyId))
			.limit(1);

		if (!company) {
			throw new Error(`No company found with ID: ${companyId}`);
		}

		return company.clientId;
	} catch (err) {
		console.error('Error in getClientIdByCompanyId:', err);
		throw err; // Let the caller handle the error
	}
}

export async function getClientProfileByStaffUserId(userId: string | undefined) {
	if (!userId) return error(400, 'Missing user id');
	const staff = await db
		.select({ clientId: clientStaffProfileTable.clientId })
		.from(clientStaffProfileTable)
		.where(eq(clientStaffProfileTable.userId, userId));
	if (staff.length) {
		const client = await db
			.select()
			.from(clientProfileTable)
			.where(eq(clientProfileTable.id, staff[0].clientId));

		return client.length ? client[0] : null;
	} else return null;
}

export async function getClientCompanyByClientId(clientId: string | undefined) {
	if (!clientId) return error(400, 'Missing client id');
	const [result] = await db
		.select()
		.from(clientCompanyTable)
		.where(eq(clientCompanyTable.clientId, clientId));

	return result;
}

export async function getClientCompanyById(companyId: string | null) {
	if (!companyId) return error(400, 'Must provide company id');
	const [result] = await db
		.select()
		.from(clientCompanyTable)
		.where(eq(clientCompanyTable.id, companyId));

	return result;
}

export async function getClientStaffProfilebyUserId(userId: string) {
	try {
		const [result] = await db
			.select()
			.from(clientStaffProfileTable)
			.where(eq(clientStaffProfileTable.userId, userId));

		return result || null;
	} catch (err) {
		console.log(err);
		return error(500, 'Error fetching client staff profile');
	}
}

export async function getClientStaffProfilebyClientId(clientId: string | undefined) {
	if (!clientId) throw error(400, 'Missing client id');
	const [result] = await db
		.select()
		.from(clientStaffProfileTable)
		.where(eq(clientStaffProfileTable.clientId, clientId));

	return result;
}

export async function getClientStaffProfilesCount(companyId: string) {
	const countResult = await db
		.select({ value: count() })
		.from(clientStaffProfileTable)
		.where(eq(clientStaffProfileTable.companyId, companyId));

	return countResult[0].value;
}

export async function getAllClientStaffProfilesForLocation(
	companyId: string,
	currentLocationId: string
) {
	const results = await db
		.select({
			profile: { ...clientStaffProfileTable },
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			}
		})
		.from(clientStaffProfileTable)
		.innerJoin(userTable, eq(clientStaffProfileTable.userId, userTable.id))
		.where(
			and(
				eq(clientStaffProfileTable.companyId, companyId),
				notExists(
					db
						.select()
						.from(clientStaffLocationTable)
						.where(
							and(
								eq(clientStaffLocationTable.staffId, clientStaffProfileTable.id),
								eq(clientStaffLocationTable.locationId, currentLocationId)
							)
						)
				)
			)
		);

	return results;
}

export async function getAllClientStaffProfiles(companyId: string, searchTerm?: string) {
	const whereConditions: SQL[] = [eq(clientStaffProfileTable.companyId, companyId)];

	// Add search conditions if searchTerm is provided
	if (searchTerm) {
		whereConditions.push(
			<SQL<unknown>>(
				or(
					ilike(userTable.firstName, `%${searchTerm}%`),
					ilike(userTable.lastName, `%${searchTerm}%`),
					ilike(userTable.email, `%${searchTerm}%`)
				)
			)
		);
	}

	const results = await db
		.select({
			profile: { ...clientStaffProfileTable },
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			}
		})
		.from(clientStaffProfileTable)
		.innerJoin(userTable, eq(clientStaffProfileTable.userId, userTable.id))
		.where(and(...whereConditions))
		.limit(DEFAULT_MAX_RECORD_LIMIT)
		.orderBy(desc(clientStaffProfileTable.createdAt));

	return results;
}

export async function getPaginatedClientStaffProfiles(
	companyId: string,
	{ limit = 25, offset = 0, orderBy = undefined }: PaginateOptions
) {
	const userCols = ['email', 'first_name', 'last_name'];
	const locationCols = ['location_name'];
	const companyCols = ['company_name'];
	const orderSelector = orderBy
		? userCols.includes(orderBy.column)
			? `u.${orderBy.column}`
			: locationCols.includes(orderBy.column)
				? `l.${orderBy.column}`
				: companyCols.includes(orderBy.column)
					? `c.${orderBy.column}`
					: `s.${orderBy.column}`
		: null;

	try {
		const query = sql.empty();

		query.append(sql`
			SELECT s.*,
						 u.first_name,
						 u.last_name,
						 u.email,
						 u.avatar_url,
						 l.location_name,
						 sl.is_primary_location,
						 c.company_name
			FROM ${clientStaffProfileTable} AS s
						 INNER JOIN ${userTable} u ON s.user_id = u.id
						 INNER JOIN ${clientCompanyTable} c ON s.company_id = c.id
						 LEFT JOIN ${clientStaffLocationTable} sl ON s.id = sl.staff_id
						 LEFT JOIN ${companyOfficeLocationTable} l ON sl.location_id = l.id
				AND (sl.is_primary_location = true OR sl.is_primary_location IS NULL)
			WHERE s.company_id = ${companyId}
		`);

		if (orderSelector && orderBy) {
			query.append(sql`
				ORDER BY
				${sql.raw(orderSelector)}
				${sql.raw(orderBy.direction.toUpperCase())}
			`);
		} else {
			query.append(sql`
				ORDER BY s.created_at DESC
			`);
		}

		query.append(sql`
			LIMIT
			${limit}
            OFFSET
			${offset}
		`);

		const results = await db.execute(query);

		// Update count to only count unique staff members
		const countResult = await db
			.select({ value: count() })
			.from(clientStaffProfileTable)
			.where(eq(clientStaffProfileTable.companyId, companyId));

		return { staff: results.rows as ClientStaffResults, count: countResult[0].value };
	} catch (err) {
		console.error(err);
		return { staff: [], count: 0 };
	}
}

export async function getClientStaffProfileDetails(staffId: string) {
	const result = await db
		.select({
			staff: { ...clientStaffProfileTable },
			user: {
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			},
			location: {
				...companyOfficeLocationTable,
				isPrimary: clientStaffLocationTable.isPrimary
			},
			company: {
				...clientCompanyTable
			}
		})
		.from(clientStaffProfileTable)
		.where(eq(clientStaffProfileTable.id, staffId))
		.innerJoin(userTable, eq(clientStaffProfileTable.userId, userTable.id))
		.innerJoin(
			clientStaffLocationTable,
			eq(clientStaffLocationTable.staffId, clientStaffProfileTable.id)
		)
		.innerJoin(
			companyOfficeLocationTable,
			eq(companyOfficeLocationTable.id, clientStaffLocationTable.locationId)
		)
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, clientStaffProfileTable.companyId));

	return result[0] || null;
}

export async function getLocationByIdForCompany(locationId: string, companyId: string) {
	const result = await db
		.select()
		.from(companyOfficeLocationTable)
		.where(
			and(
				eq(companyOfficeLocationTable.id, locationId),
				eq(companyOfficeLocationTable.companyId, companyId)
			)
		);

	return result[0] || null;
}

export async function getAllClientLocationsByCompanyId(
	companyId: string
): Promise<ClientCompanyLocationSelect[]> {
	const results = await db
		.select()
		.from(companyOfficeLocationTable)
		.where(eq(companyOfficeLocationTable.companyId, companyId));

	return results;
}

export async function getPaginatedLocationsByCompanyId(
	companyId: string,
	{ limit = 25, offset = 0, orderBy = undefined }: PaginateOptions,
	locationIds?: string[] | null
) {
	if (Array.isArray(locationIds) && locationIds.length === 0) {
		return { locations: [], count: 0 };
	}
	const orderSelector = orderBy ? orderBy.column : null;
	try {
		const query = sql.empty();

		query.append(sql`
			SELECT l.*
			FROM ${companyOfficeLocationTable} AS l
			WHERE l.company_id = ${companyId}
		`);

		if (Array.isArray(locationIds)) {
			query.append(sql` AND l.id = ANY(${locationIds})`);
		}

		if (orderSelector && orderBy) {
			query.append(sql`
				ORDER BY
				${
					orderBy.direction === 'asc'
						? sql`${sql.raw(orderSelector)}
						ASC`
						: sql`${sql.raw(orderSelector)}
						DESC`
				}
			`);
		} else {
			query.append(sql`
				ORDER BY l.created_at DESC
			`);
		}

		query.append(sql`
			LIMIT
			${limit}
       OFFSET
			${offset}
		`);

		const results = await db.execute(query);

		const countResult = await db
			.select({ value: count() })
			.from(companyOfficeLocationTable)
			.where(
				and(
					eq(companyOfficeLocationTable.companyId, companyId),
					Array.isArray(locationIds)
						? inArray(companyOfficeLocationTable.id, locationIds)
						: undefined
				)
			);

		return { locations: results.rows, count: countResult[0].value };
	} catch (err) {
		console.error(err);
	}
}

// export async function getClientStaffLocations(userId: string) {}

export async function getClientSubscription(clientId: string | undefined) {
	if (!clientId) throw error(400, 'Client ID is required');

	const [result] = await db
		.select()
		.from(clientSubscriptionTable)
		.where(eq(clientSubscriptionTable.clientId, clientId));

	if (!result) {
		return null;
	}

	return result.stripeCustomerId || null;
}

export async function createCompanyLocation(values: ClientCompanyLocation) {
	const result = await db
		.insert(companyOfficeLocationTable)
		.values(values)
		.onConflictDoNothing()
		.returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}

export async function getLocationContactDestinations(
	locationId: string
): Promise<LocationContactDestinationSelect[]> {
	return await db
		.select()
		.from(locationContactDestinationTable)
		.where(eq(locationContactDestinationTable.locationId, locationId))
		.orderBy(locationContactDestinationTable.type, locationContactDestinationTable.createdAt);
}

export async function createLocationContactDestination(
	values: LocationContactDestination
): Promise<LocationContactDestinationSelect> {
	const [row] = await db.insert(locationContactDestinationTable).values(values).returning();
	return row;
}

export async function deleteLocationContactDestination(
	id: string,
	locationId: string
): Promise<boolean> {
	const result = await db
		.delete(locationContactDestinationTable)
		.where(
			and(
				eq(locationContactDestinationTable.id, id),
				eq(locationContactDestinationTable.locationId, locationId)
			)
		)
		.returning({ id: locationContactDestinationTable.id });
	return result.length > 0;
}

export async function updateCompanyLocation(
	locationId: string | undefined,
	values: Partial<ClientCompanyLocation>
) {
	if (!locationId) throw error(400, 'Location ID is required for update');
	try {
		const [result] = await db
			.update(companyOfficeLocationTable)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(companyOfficeLocationTable.id, locationId))
			.returning();
		if (!result) {
			return null;
		} else {
			return result;
		}
	} catch (err) {
		console.error('Error updating company location:', err);
		throw error(500, 'Error updating company location');
	}
}

// export async function createCompanyStaffProfile(values: ClientCompanyStaffProfile) { }

export async function getStaffProfilesForLocation(locationId: string) {
	return await db
		.select({
			profile: { ...clientStaffProfileTable },
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			},
			// Expose whether THIS location is the staff's primary so the
			// /locations/[id] page can render a "Primary" badge / Make Primary
			// button per row.
			isPrimary: clientStaffLocationTable.isPrimary
		})
		.from(clientStaffProfileTable)
		.innerJoin(userTable, eq(userTable.id, clientStaffProfileTable.userId))
		.innerJoin(
			clientStaffLocationTable,
			and(
				eq(clientStaffLocationTable.staffId, clientStaffProfileTable.id),
				eq(clientStaffLocationTable.locationId, locationId)
			)
		)
		.where(eq(clientStaffLocationTable.locationId, locationId));
}

export async function getPrimaryLocationForStaff(staffId: string) {
	const [result] = await db
		.select({
			id: companyOfficeLocationTable.id,
			name: companyOfficeLocationTable.name,
			streetOne: companyOfficeLocationTable.streetOne,
			streetTwo: companyOfficeLocationTable.streetTwo,
			city: companyOfficeLocationTable.city,
			state: companyOfficeLocationTable.state,
			zipcode: companyOfficeLocationTable.zipcode,
			isPrimary: clientStaffLocationTable.isPrimary
		})
		.from(clientStaffLocationTable)
		.innerJoin(
			companyOfficeLocationTable,
			eq(clientStaffLocationTable.locationId, companyOfficeLocationTable.id)
		)
		.where(
			and(
				eq(clientStaffLocationTable.staffId, staffId),
				eq(clientStaffLocationTable.isPrimary, true)
			)
		)
		.limit(1);
	if (!result) {
		return null;
	} else {
		return result;
	}
}

export async function getLocationsForStaffUser(staffId: string): Promise<StaffLocation[]> {
	try {
		const locations = await db
			.select({
				id: companyOfficeLocationTable.id,
				name: companyOfficeLocationTable.name,
				streetOne: companyOfficeLocationTable.streetOne,
				streetTwo: companyOfficeLocationTable.streetTwo,
				city: companyOfficeLocationTable.city,
				state: companyOfficeLocationTable.state,
				zipcode: companyOfficeLocationTable.zipcode,
				companyPhone: companyOfficeLocationTable.companyPhone,
				cellPhone: companyOfficeLocationTable.cellPhone,
				operatingHours: companyOfficeLocationTable.operatingHours,
				email: companyOfficeLocationTable.email,
				isPrimary: clientStaffLocationTable.isPrimary,
				completeAddress: companyOfficeLocationTable.completeAddress,
				lat: companyOfficeLocationTable.lat,
				lon: companyOfficeLocationTable.lon
			})
			.from(clientStaffLocationTable)
			.innerJoin(
				companyOfficeLocationTable,
				eq(clientStaffLocationTable.locationId, companyOfficeLocationTable.id)
			)
			.where(eq(clientStaffLocationTable.staffId, staffId));

		return locations;
	} catch (err) {
		console.log(err);
		error(500, 'Error getting locations for staff user');
	}
}

export async function createClientCompany(values: ClientCompany, tx?: any) {
	const query = tx || db;
	try {
		const [result] = await query
			.insert(clientCompanyTable)
			.values(values)
			.onConflictDoNothing()
			.returning();

		return result || null;
	} catch (err) {
		console.log(err);
		throw error(500, 'Error creating company');
	}
}

export async function getCalendarEventsForClient(
	clientId: string | undefined,
	locationIds?: string[] | null
) {
	if (!clientId) return error(400, 'Missing Client Id');
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
	const clientCompanyResult = await db
		.select({
			client: { ...clientProfileTable },
			company: { ...clientCompanyTable }
		})
		.from(clientProfileTable)
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.where(eq(clientProfileTable.id, clientId));

	if (!clientCompanyResult.length) {
		return null;
	}

	const recurrenceDays = await db
		.select({
			recurrenceDay: { ...recurrenceDayTable },
			requisition: {
				...requisitionTable,
				client: { ...clientCompanyTable },
				location: { ...companyOfficeLocationTable }
			},
			discipline: { ...disciplineTable }
		})
		.from(recurrenceDayTable)
		.where(
			and(
				eq(requisitionTable.companyId, clientCompanyResult[0].company.id),
				eq(requisitionTable.archived, false),
				Array.isArray(locationIds)
					? inArray(requisitionTable.locationId, locationIds)
					: undefined
			)
		)
		.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.leftJoin(
			companyOfficeLocationTable,
			eq(requisitionTable.locationId, companyOfficeLocationTable.id)
		);

	const recurrenceDayEvents = recurrenceDays.map((recurrenceDay) =>
		convertRecurrenceDayToEvent(
			clientCompanyResult[0].company,
			recurrenceDay.recurrenceDay,
			recurrenceDay.requisition,
			recurrenceDay.discipline,
			recurrenceDay.requisition.location
		)
	);

	return [...recurrenceDayEvents];
}

export async function getRequisitionsForClientWithLimit(
	clientId: string,
	count: number,
	locationIds?: string[] | null
) {
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
	try {
		const company = await getClientCompanyByClientId(clientId);

		const paginatedRequisitions = await db
			.select({
				requisition: { ...requisitionTable, disciplineName: disciplineTable.name },
				company: { ...clientCompanyTable },
				user: {
					id: userTable.id,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl,
					email: userTable.email
				},
				location: {
					locationName: companyOfficeLocationTable.name,
					completeAddress: companyOfficeLocationTable.completeAddress
				}
			})
			.from(requisitionTable)
			.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.leftJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.leftJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
			.leftJoin(userTable, eq(clientProfileTable.userId, userTable.id))
			.leftJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.where(
				and(
					eq(requisitionTable.companyId, company.id),
					ne(requisitionTable.status, 'PENDING'),
					Array.isArray(locationIds)
						? inArray(requisitionTable.locationId, locationIds)
						: undefined
				)
			)
			.limit(count)
			.orderBy(desc(requisitionTable.createdAt));

		if (paginatedRequisitions.length === 0) return [];

		const requisitionIds = paginatedRequisitions.map((r) => r.requisition.id);

		const recurrenceDays = await db
			.select({
				requisitionId: recurrenceDayTable.requisitionId,
				dayStart: recurrenceDayTable.dayStart,
				dayEnd: recurrenceDayTable.dayEnd
			})
			.from(recurrenceDayTable)
			.where(inArray(recurrenceDayTable.requisitionId, requisitionIds));

		const recurrenceByRequisition = new Map<number, { dayStart: Date; dayEnd: Date }[]>();
		for (const day of recurrenceDays) {
			if (!recurrenceByRequisition.has(day.requisitionId)) {
				recurrenceByRequisition.set(day.requisitionId, []);
			}
			recurrenceByRequisition.get(day.requisitionId)!.push({
				dayStart: day.dayStart,
				dayEnd: day.dayEnd
			});
		}

		return paginatedRequisitions.map((row) => ({
			...row,
			recurrenceDays: recurrenceByRequisition.get(row.requisition.id) ?? []
		}));
	} catch (err) {
		console.log(err);
		throw error(500, `${err}`);
	}
}

export async function getClientDashboardData(
	clientId: string | undefined,
	userId: string | undefined,
	locationIds?: string[] | null
) {
	if (!clientId) throw error(400, 'Client ID required');
	if (!userId) throw error(400, 'User ID required');

	const company = await getClientCompanyByClientId(clientId);

	if (!company) throw error(400, 'No company associated with that client id');

	const [
		requisitions,
		timesheetsDueCount,
		discrepancies,
		newApplicationsCount,
		supportTickets,
		requisitionApplications,
		timesheetsDue,
		invoices
	] = await Promise.all([
		await getRequisitionsForClientWithLimit(clientId, 5, locationIds),
		await getTimesheetsDueCount(clientId, locationIds),
		await getClientCompanyTimesheetDiscrepancies(clientId, locationIds),
		await getNewApplicationsCount(clientId, locationIds),
		await getSupportTicketsForUserWithLimit(userId, 5),
		await getRecentRequisitionApplications(company.id, locationIds),
		await getRecentTimesheetsDueForClient(clientId, locationIds),
		await getClientInvoices(clientId, { limit: 5, locationIds })
	]);

	return {
		requisitions,
		timesheetsDueCount,
		timesheetsDue,
		discrepanciesCount: discrepancies.length,
		supportTickets,
		newApplicationsCount,
		positionApplications: requisitionApplications,
		invoices
	};
}

export async function getPrimaryLocationForCompany(companyId: string) {
	try {
		const [result] = await db
			.select()
			.from(companyOfficeLocationTable)
			.where(eq(companyOfficeLocationTable.companyId, companyId))
			.orderBy(desc(companyOfficeLocationTable.createdAt))
			.limit(1);

		return result;
	} catch (err) {
		console.log(err);
		return error(500, 'Error getting primary location for company');
	}
}

/**
 * Pending staff invites — rows in user_invites with a non-null token (i.e.
 * not yet accepted; the sign-up flow nulls the token on acceptance). Includes
 * BOTH still-valid invites and expired ones so the UI can surface the expired
 * ones for resend. Joined to the staff-invite-locations row + the location
 * name so the table can render directly.
 */
export async function getPendingInvitesForCompany(companyId: string) {
	return await db
		.select({
			id: userInviteTable.id,
			email: userInviteTable.email,
			staffRole: userInviteTable.staffRole,
			invitedRole: userInviteTable.invitedRole,
			createdAt: userInviteTable.createdAt,
			expiresAt: userInviteTable.expiresAt,
			token: userInviteTable.token,
			locationId: companyStaffInviteLocations.locationId,
			locationName: companyOfficeLocationTable.name
		})
		.from(userInviteTable)
		.leftJoin(
			companyStaffInviteLocations,
			eq(companyStaffInviteLocations.token, userInviteTable.token)
		)
		.leftJoin(
			companyOfficeLocationTable,
			eq(companyOfficeLocationTable.id, companyStaffInviteLocations.locationId)
		)
		.where(
			and(eq(userInviteTable.companyId, companyId), isNotNull(userInviteTable.token))
		)
		.orderBy(desc(userInviteTable.createdAt));
}

/**
 * Same as getPendingInvitesForCompany but narrowed to invites tied to a
 * specific location — used on /locations/[id] to show "who's been invited
 * to this location".
 */
export async function getPendingInvitesForLocation(locationId: string) {
	return await db
		.select({
			id: userInviteTable.id,
			email: userInviteTable.email,
			staffRole: userInviteTable.staffRole,
			invitedRole: userInviteTable.invitedRole,
			createdAt: userInviteTable.createdAt,
			expiresAt: userInviteTable.expiresAt,
			token: userInviteTable.token
		})
		.from(userInviteTable)
		.innerJoin(
			companyStaffInviteLocations,
			eq(companyStaffInviteLocations.token, userInviteTable.token)
		)
		.where(
			and(
				eq(companyStaffInviteLocations.locationId, locationId),
				isNotNull(userInviteTable.token)
			)
		)
		.orderBy(desc(userInviteTable.createdAt));
}

/**
 * Revoke a pending invite. Deletes the staff_invite_locations row too so
 * the invite link in the email becomes invalid (the /auth/invite/[token]
 * page looks up by token; deleting the row makes it 404 cleanly).
 */
export async function revokeInvite(inviteId: string, companyId: string) {
	const [invite] = await db
		.select({ token: userInviteTable.token, companyId: userInviteTable.companyId })
		.from(userInviteTable)
		.where(eq(userInviteTable.id, inviteId))
		.limit(1);
	if (!invite) throw error(404, 'Invite not found');
	if (invite.companyId !== companyId) throw error(403, 'Invite belongs to another company');

	await db.transaction(async (tx) => {
		if (invite.token) {
			await tx
				.delete(companyStaffInviteLocations)
				.where(eq(companyStaffInviteLocations.token, invite.token));
		}
		await tx.delete(userInviteTable).where(eq(userInviteTable.id, inviteId));
	});
}

/**
 * Resend a pending invite email. If the invite has already expired we bump
 * the expiresAt forward another full TTL window so the link in the resent
 * email is actually usable. Token is intentionally NOT rotated — any
 * previously-sent links keep working until acceptance.
 */
export async function resendInvite(inviteId: string, companyId: string) {
	const [invite] = await db
		.select()
		.from(userInviteTable)
		.where(eq(userInviteTable.id, inviteId))
		.limit(1);
	if (!invite) throw error(404, 'Invite not found');
	if (invite.companyId !== companyId) throw error(403, 'Invite belongs to another company');
	if (!invite.token) throw error(400, 'Invite has already been accepted');

	// Bump expiry forward if expired, otherwise leave alone.
	const INVITE_EXPIRATION_DAYS = 7;
	const now = new Date();
	if (invite.expiresAt <= now) {
		const newExpiresAt = new Date();
		newExpiresAt.setDate(newExpiresAt.getDate() + INVITE_EXPIRATION_DAYS);
		await db
			.update(userInviteTable)
			.set({ expiresAt: newExpiresAt, updatedAt: new Date() })
			.where(eq(userInviteTable.id, inviteId));
	}

	const [company] = await db
		.select({ name: clientCompanyTable.companyName })
		.from(clientCompanyTable)
		.where(eq(clientCompanyTable.id, companyId))
		.limit(1);

	const emailService = new EmailService();
	const result = await emailService.sendClientStaffInviteEmail(
		invite.email,
		invite.token,
		company?.name || 'your team'
	);
	return result;
}

export async function addStaffToLocation(values: NewClientCompanyStaffLocation) {
	try {
		const [result] = await db
			.insert(clientStaffLocationTable)
			.values(values)
			.onConflictDoNothing()
			.returning();

		return result;
	} catch (err) {
		console.log(err);
		return error(500, 'Error adding staff to location');
	}
}

/**
 * Fetch a staff member's current location assignments along with the
 * locationName so the management UI can render rows directly.
 */
export async function getStaffLocationsWithMeta(staffId: string) {
	return await db
		.select({
			id: clientStaffLocationTable.id,
			locationId: clientStaffLocationTable.locationId,
			isPrimary: clientStaffLocationTable.isPrimary,
			locationName: companyOfficeLocationTable.name
		})
		.from(clientStaffLocationTable)
		.innerJoin(
			companyOfficeLocationTable,
			eq(companyOfficeLocationTable.id, clientStaffLocationTable.locationId)
		)
		.where(eq(clientStaffLocationTable.staffId, staffId));
}

/**
 * Authoritatively set the list of locations for a staff member. Replaces all
 * existing rows in clientStaffLocationTable for that staff with the supplied
 * set, exactly one of which is flagged `isPrimary=true`. Wrapped in a
 * transaction so the staff is never left without a primary mid-update.
 *
 * Caller responsibilities:
 *   - Pass `companyId` so we can validate ownership of every locationId.
 *   - `primaryLocationId` MUST be in `locationIds`; throws otherwise.
 *   - Passing `locationIds: []` removes all assignments — fine if that's
 *     intentional, but the staff will see nothing under location-scoping.
 */
export async function setStaffLocations(args: {
	staffId: string;
	companyId: string;
	locationIds: string[];
	primaryLocationId: string | null;
}) {
	const { staffId, companyId, locationIds, primaryLocationId } = args;

	if (primaryLocationId && !locationIds.includes(primaryLocationId)) {
		throw error(400, 'Primary location must be one of the assigned locations');
	}

	// Validate every locationId belongs to the same company — defense in
	// depth against a stale form or an attacker passing arbitrary ids.
	if (locationIds.length > 0) {
		const owned = await db
			.select({ id: companyOfficeLocationTable.id })
			.from(companyOfficeLocationTable)
			.where(
				and(
					eq(companyOfficeLocationTable.companyId, companyId),
					inArray(companyOfficeLocationTable.id, locationIds)
				)
			);
		if (owned.length !== locationIds.length) {
			throw error(400, 'One or more locations do not belong to this company');
		}
	}

	await db.transaction(async (tx) => {
		await tx
			.delete(clientStaffLocationTable)
			.where(eq(clientStaffLocationTable.staffId, staffId));

		if (locationIds.length > 0) {
			await tx.insert(clientStaffLocationTable).values(
				locationIds.map((locationId) => ({
					id: crypto.randomUUID(),
					staffId,
					companyId,
					locationId,
					isPrimary: locationId === primaryLocationId
				}))
			);
		}
	});
}

export async function inviteStaffUsersToAccount(locationId: string, invitees: NewUserInvite[]) {
	const [location] = await db
		.select()
		.from(companyOfficeLocationTable)
		.where(eq(companyOfficeLocationTable.id, locationId));

	if (!location) {
		throw new Error('Location not found');
	}

	// Get company name for the email
	const [company] = await db
		.select({
			name: clientCompanyTable.companyName
		})
		.from(clientCompanyTable)
		.where(eq(clientCompanyTable.id, location.companyId));

	if (!company) {
		throw new Error('Company not found');
	}

	const emailService = new EmailService();

	const inviteResults = await Promise.all(
		invitees.map(async (invitee) => {
			const token = crypto.randomUUID();

			try {
				// Begin transaction
				return await db.transaction(async (tx) => {
					// Create the user invite
					const [invite] = await tx
						.insert(userInviteTable)
						.values({
							id: crypto.randomUUID(),
							token,
							email: invitee.email.toLowerCase(),
							expiresAt: invitee.expiresAt,
							referrerRole: invitee.referrerRole,
							referrerId: invitee.referrerId,
							invitedRole: invitee.invitedRole,
							staffRole: invitee.staffRole,
							companyId: location.companyId
						})
						.returning();

					// Create the location association
					await tx.insert(companyStaffInviteLocations).values({
						token,
						locationId,
						isPrimary: true
					});

					// Send the invite email
					try {
						await emailService.sendClientStaffInviteEmail(
							invitee.email,
							token,
							company.name || 'unknown company'
						);

						return {
							success: true,
							invite,
							email: invitee.email,
							emailSent: true
						};
					} catch (emailError) {
						console.error('Error sending invite email:', emailError);
						return {
							success: true,
							invite,
							email: invitee.email,
							emailSent: false,
							emailError: emailError instanceof Error ? emailError.message : 'Failed to send email'
						};
					}
				});
			} catch (error) {
				console.error('Error creating invite:', error);
				return {
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
					email: invitee.email,
					emailSent: false
				};
			}
		})
	);

	// Check if any invites failed to create
	const dbFailures = inviteResults.filter((result) => !result.success);
	if (dbFailures.length > 0) {
		throw new Error(`Failed to create invites for: ${dbFailures.map((f) => f.email).join(', ')}`);
	}

	// Log any email sending failures
	const emailFailures = inviteResults.filter((result) => result.success && !result.emailSent);
	if (emailFailures.length > 0) {
		console.warn(`Failed to send emails for: ${emailFailures.map((f) => f.email).join(', ')}`);
	}

	return inviteResults;
}

export async function getClientDocuments(clientId?: string) {
	if (!clientId) throw error(400, 'Client ID required');
	return await db
		.select()
		.from(clientDocumentUploadsTable)
		.where(eq(clientDocumentUploadsTable.clientId, clientId))
		.orderBy(desc(clientDocumentUploadsTable.createdAt));
}

export async function uploadClientDocument(data: {
	clientId: string;
	uploadUrl: string;
	filename: string;
	type: 'LICENSE' | 'CERTIFICATE' | 'AGREEMENT' | 'OTHER';
	adminOnly?: boolean;
}) {
	const [result] = await db
		.insert(clientDocumentUploadsTable)
		.values({
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			clientId: data.clientId,
			uploadUrl: data.uploadUrl,
			filename: data.filename,
			type: data.type,
			adminOnly: data.adminOnly ?? false
		})
		.returning();
	return result;
}

export async function deleteClientDocument(documentId: string) {
	await db.delete(clientDocumentUploadsTable).where(eq(clientDocumentUploadsTable.id, documentId));
}

export async function toggleClientDocumentLock(documentId: string) {
	const [doc] = await db
		.select()
		.from(clientDocumentUploadsTable)
		.where(eq(clientDocumentUploadsTable.id, documentId));

	const [result] = await db
		.update(clientDocumentUploadsTable)
		.set({ adminOnly: !doc.adminOnly, updatedAt: new Date() })
		.where(eq(clientDocumentUploadsTable.id, documentId))
		.returning();
	return result;
}
