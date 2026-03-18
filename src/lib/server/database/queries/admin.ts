/* eslint-disable @typescript-eslint/no-explicit-any */
import { sql, count, eq, desc, lt, and, ne, ilike, or } from 'drizzle-orm';
import db from '../drizzle';
import { userTable, type UpdateUser, type User } from '$lib/server/database/schemas/auth';
import { DEFAULT_MAX_RECORD_LIMIT, USER_ROLES } from '$lib/config/constants';
import {
	invoiceTable,
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable,
	workdayTable,
	type InvoiceWithRelations
} from '$lib/server/database/schemas/requisition';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable,
	type ClientCompany,
	type ClientCompanyLocation,
	type ClientProfile
} from '$lib/server/database/schemas/client';
import { convertRecurrenceDayToEvent } from '$lib/components/calendar/utils';
import type { PgTable, PgTableWithColumns } from 'drizzle-orm/pg-core';
import { actionHistoryTable, supportTicketTable } from '$lib/server/database/schemas/admin';
import type { PaginateOptions } from '$lib/types';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable,
	type CandidateDisciplineExperience,
	type CandidateProfile
} from '$lib/server/database/schemas/candidate';
import {
	getRecurrenceDaysForTimesheet,
	getWorkdaysForTimesheet,
	type TimesheetDiscrepancy,
	validateTimesheet
} from '$lib/server/database/queries/requisitions';
import type Stripe from 'stripe';
import { error } from '@sveltejs/kit';
import { disciplineTable } from '../schemas/skill';

export type ActionType = 'CREATE' | 'UPDATE' | 'DELETE';

export type AdminUserRaw = {
	id: string;
	first_name: string;
	last_name: string;
	email: string;
	role: string;
	avatar_url: string;
};

export type AdminUserResults = AdminUserRaw[];

export async function getAdminUsers(searchTerm?: string) {
	try {
		const results = await db
			.select({
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl,
				role: userTable.role
			})
			.from(userTable)
			.where(
				and(
					eq(userTable.role, USER_ROLES.SUPERADMIN),
					searchTerm
						? or(
								ilike(userTable.email, `%${searchTerm}%`),
								ilike(userTable.firstName, `%${searchTerm}%`),
								ilike(userTable.lastName, `%${searchTerm}%`)
							)
						: undefined
				)
			)
			.orderBy(desc(userTable.createdAt))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		return results;
	} catch (err) {
		throw error(500, 'Failed to fetch admin users');
	}
}

export async function getPaginatedAdminUsers({
	limit = 25,
	offset = 0,
	orderBy = undefined
}: PaginateOptions) {
	try {
		const orderSelector = orderBy ? `u.${orderBy.column}` : null;

		const query = sql.empty();

		query.append(sql`
			SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.avatar_url
			FROM ${userTable} AS u
			WHERE u.role = 'SUPERADMIN'
		`);

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
				ORDER BY u.created_at DESC
			`);
		}

		query.append(sql`
			LIMIT
			${limit}
      OFFSET
			${offset}
		`);

		const countResult = await db
			.select({ value: count() })
			.from(userTable)
			.where(eq(userTable.role, USER_ROLES.SUPERADMIN));

		const results = await db.execute(query);

		return {
			admins: results.rows,
			count: countResult[0].value
		};
	} catch (error) {
		console.error(error);
	}
}

export async function getAdminUserById(id: string) {
	const [result] = await db
		.select({
			id: userTable.id,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			email: userTable.email,
			avatarUrl: userTable.avatarUrl,
			role: userTable.role
		})
		.from(userTable)
		.where(and(eq(userTable.id, id), eq(userTable.role, USER_ROLES.SUPERADMIN)));

	return result;
}

export async function updateAdminUserProfile(id: string, values: UpdateUser) {
	const [result] = await db
		.update(userTable)
		.set({
			...values,
			updatedAt: new Date()
		})
		.where(and(eq(userTable.id, id), eq(userTable.role, USER_ROLES.SUPERADMIN)))
		.returning();

	return result;
}

export async function deleteAdminUser(id: string) {
	return await db.delete(userTable).where(eq(userTable.id, id));
}

export async function getCalendarEventsForAdmin(userId: string) {
	const adminUser = await db
		.select({ id: userTable.id, role: userTable.role })
		.from(userTable)
		.where(eq(userTable.id, userId));

	if (!adminUser.length) {
		throw new Error('NO ADMIN ACCESS');
	}

	const recurrenceDays = await db
		.select({
			recurrenceDay: { ...recurrenceDayTable },
			requisition: { ...requisitionTable, client: { ...clientCompanyTable } }
		})
		.from(recurrenceDayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.where(eq(requisitionTable.archived, false));

	const recurrenceDayEvents = recurrenceDays.map((recurrenceDay) =>
		convertRecurrenceDayToEvent(recurrenceDay.recurrenceDay, recurrenceDay.requisition)
	);

	return [...recurrenceDayEvents];
}

export async function getNewClientSignupsPreview(limit: number) {
	const result = await db
		.select({
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl,
				email: userTable.email
			},
			clientProfile: { ...clientProfileTable },
			company: { ...clientCompanyTable }
		})
		.from(clientProfileTable)
		.innerJoin(userTable, eq(userTable.id, clientProfileTable.userId))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.limit(limit)
		.orderBy(desc(clientProfileTable.createdAt));

	return result;
}

export const writeActionHistory = async ({
	table,
	userId,
	action,
	entityId,
	beforeState,
	afterState,
	metadata = {}
}: {
	table: string;
	userId: string;
	action: ActionType;
	entityId: string;
	beforeState?: Record<string, any>;
	afterState?: Record<string, any>;
	metadata?: Record<string, any>;
}) => {
	try {
		const [result] = await db
			.insert(actionHistoryTable)
			.values({
				id: crypto.randomUUID(),
				entityId,
				entityType: table,
				userId,
				action,
				changes: {
					before: beforeState,
					after: afterState
				},
				metadata
			})
			.returning();

		return result;
	} catch (error) {
		console.error('Failed to write action history:', error);
		throw new Error('Failed to record action history');
	}
};

export async function getOpenSupportTicketsCount() {
	const [result] = await db
		.select({ count: count() })
		.from(supportTicketTable)
		.where(ne(supportTicketTable.status, 'CLOSED'));

	return result.count;
}

export async function getSupportTicketsPreview(limit: number) {
	const result = await db
		.select({
			supportTicket: { ...supportTicketTable },
			reportedBy: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				avatarUrl: userTable.avatarUrl
			}
		})
		.from(supportTicketTable)
		.innerJoin(userTable, eq(supportTicketTable.reportedById, userTable.id))
		.where(ne(supportTicketTable.status, 'CLOSED'))
		.limit(limit)
		.orderBy(desc(supportTicketTable.updatedAt));

	return result;
}

export async function getRequisitionsPreviewAdmin(limit: number) {
	const result = await db
		.select({
			requisition: { ...requisitionTable, disciplineName: disciplineTable.name },
			client: { ...clientProfileTable },
			company: { ...clientCompanyTable },
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl,
				email: userTable.email
			}
		})
		.from(requisitionTable)
		.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
		.leftJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
		.leftJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.leftJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.limit(limit)
		.orderBy(desc(requisitionTable.createdAt));

	return result;
}

export async function getDiscrepanciesForAdminDashboard() {
	const timesheets = await db
		.select({
			timeSheetId: timeSheetTable.id,
			createdAt: timeSheetTable.createdAt,
			updatedAt: timeSheetTable.updatedAt,
			totalHoursWorked: timeSheetTable.totalHoursWorked,
			totalHoursBilled: timeSheetTable.totalHoursBilled,
			weekBeginDate: timeSheetTable.weekBeginDate,
			requisitionId: requisitionTable.id,
			clientCompanyName: clientCompanyTable.companyName,
			validated: timeSheetTable.validated,
			awaitingClientSignature: timeSheetTable.awaitingClientSignature,
			hourlyRate: requisitionTable.hourlyRate,
			hoursRaw: timeSheetTable.hoursRaw,
			status: timeSheetTable.status,
			candidate: {
				...candidateProfileTable,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl,
				email: userTable.email
			}
		})
		.from(timeSheetTable)
		.innerJoin(requisitionTable, eq(timeSheetTable.requisitionId, requisitionTable.id))
		.innerJoin(clientProfileTable, eq(timeSheetTable.associatedClientId, clientProfileTable.id))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.leftJoin(
			candidateProfileTable,
			eq(timeSheetTable.associatedCandidateId, candidateProfileTable.id)
		)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(eq(timeSheetTable.status, 'DISCREPANCY'))
		.limit(DEFAULT_MAX_RECORD_LIMIT);

	return timesheets;
}

export async function getNewCandidateSignupsPreview(limit: number) {
	const result = await db
		.select({
			user: {
				id: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl,
				email: userTable.email
			},
			profile: { ...candidateProfileTable }
		})
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(eq(candidateProfileTable.status, 'PENDING'))
		.limit(limit)
		.orderBy(desc(candidateProfileTable.createdAt));

	return result;
}

export async function getTimesheetsDueCount() {
	const [result] = await db
		.select({ count: count() })
		.from(timeSheetTable)
		.where(eq(timeSheetTable.status, 'PENDING'));

	return result.count;
}

export async function getInvoicesDueCount() {
	const [result] = await db
		.select({ count: count() })
		.from(invoiceTable)
		.where(lt(invoiceTable.dueDate, new Date()));

	return result.count;
}

export async function getInvoicesDuePreview(limit: number): Promise<InvoiceWithRelations[]> {
	const result = await db
		.select({
			invoice: invoiceTable,
			candidateProfile: candidateProfileTable,
			candidateUser: {
				id: sql<string>`candidate_user
				.
				id`,
				firstName: sql<string>`candidate_user
				.
				first_name`,
				lastName: sql<string>`candidate_user
				.
				last_name`,
				avatarUrl: sql<string>`candidate_user
				.
				avatar_url`
			},
			timesheet: timeSheetTable,
			requisition: requisitionTable,
			client: clientProfileTable,
			clientCompany: clientCompanyTable,
			clientUser: {
				id: sql<string>`client_user
				.
				id`,
				firstName: sql<string>`client_user
				.
				first_name`,
				lastName: sql<string>`client_user
				.
				last_name`,
				avatarUrl: sql<string>`client_user
				.
				avatar_url`
			}
		})
		.from(invoiceTable)
		.leftJoin(candidateProfileTable, eq(invoiceTable.candidateId, candidateProfileTable.id))
		.leftJoin(
			sql`${userTable}
			as candidate_user`,
			sql`${candidateProfileTable.userId}
			= candidate_user.id`
		)
		.leftJoin(timeSheetTable, eq(invoiceTable.timesheetId, timeSheetTable.id))
		.leftJoin(requisitionTable, eq(invoiceTable.requisitionId, requisitionTable.id))
		.innerJoin(clientProfileTable, eq(invoiceTable.clientId, clientProfileTable.id))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.innerJoin(
			sql`${userTable}
			as client_user`,
			sql`${clientProfileTable.userId}
			= client_user.id`
		)
		.orderBy(desc(invoiceTable.createdAt))
		.where(and(lt(invoiceTable.dueDate, new Date()), eq(invoiceTable.status, 'open')))
		.limit(limit);

	return result.map((row) => ({
		invoice: row.invoice,
		candidate:
			row.candidateProfile && row.candidateUser
				? {
						profile: row.candidateProfile,
						user: row.candidateUser
					}
				: null,
		timesheet: row.timesheet,
		requisition: row.requisition,
		lineItems: (row.invoice.lineItems as Stripe.InvoiceLineItem[]) || [],
		client: row.client,
		clientUser: row.clientUser,
		company: row.clientCompany
	}));
}
export async function getAdminDashboardData() {
	const [
		timesheetsDueCount,
		supportTickets,
		openSupportTicketsCount,
		discrepancies,
		newCandidateProfilesPreview,
		newClientSignups,
		invoicesDueCount,
		invoicesDue,
		requisitions
	] = await Promise.all([
		getTimesheetsDueCount().catch((e) => {
			console.error('❌ getTimesheetsDueCount failed:', e.message);
			return 0;
		}),
		getSupportTicketsPreview(10).catch((e) => {
			console.error('❌ getSupportTicketsPreview failed:', e.message);
			return [];
		}),
		getOpenSupportTicketsCount().catch((e) => {
			console.error('❌ getOpenSupportTicketsCount failed:', e.message);
			return 0;
		}),
		getDiscrepanciesForAdminDashboard().catch((e) => {
			console.error('❌ getDiscrepanciesForAdminDashboard failed:', e.message);
			return [];
		}),
		getNewCandidateSignupsPreview(10).catch((e) => {
			console.error('❌ getNewCandidateSignupsPreview failed:', e.message);
			return [];
		}),
		getNewClientSignupsPreview(10).catch((e) => {
			console.error('❌ getNewClientSignupsPreview failed:', e.message);
			return [];
		}),
		getInvoicesDueCount().catch((e) => {
			console.error('❌ getInvoicesDueCount failed:', e.message);
			return 0;
		}),
		getInvoicesDuePreview(10).catch((e) => {
			console.error('❌ getInvoicesDuePreview failed:', e.message);
			return [];
		}),
		getRequisitionsPreviewAdmin(10).catch((e) => {
			console.error('❌ getRequisitionsPreviewAdmin failed:', e.message);
			return [];
		})
	]);

	return {
		timesheetsDueCount,
		supportTickets,
		openSupportTicketsCount,
		discrepancies,
		newCandidateProfiles: newCandidateProfilesPreview,
		newClientSignups,
		invoicesDueCount,
		invoicesDue,
		requisitions
	};
}

export async function getClientProfileByIdAdmin(clientId: string) {
	const [result] = await db
		.select()
		.from(clientProfileTable)
		.where(eq(clientProfileTable.id, clientId));

	return result || null;
}

import { inArray } from 'drizzle-orm';
import { Argon2id } from 'oslo/password';

interface ImportUser {
	firstName: string;
	lastName: string;
	email: string;
	companyName?: string;
	companyLogo?: string;
	baseLocation?: string;
	address?: string;
	discipline?: string;
}

export async function bulkCreateSuperadmins(tx: any, users: ImportUser[]) {
	const hashedPassword = await new Argon2id().hash('dtssadminuser');

	const userRecords: User[] = users.map((user) => ({
		id: crypto.randomUUID(),
		createdAt: new Date(),
		updatedAt: new Date(),
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		role: 'SUPERADMIN' as const,
		completedOnboarding: true,
		verified: true,
		receiveEmail: true,
		provider: '',
		providerId: '',
		avatarUrl: null,
		onboardingStep: null,
		blacklisted: false,
		stripeCustomerId: null,
		timezone: null,
		token: crypto.randomUUID(),
		password: hashedPassword
	}));

	// Insert all at once
	await tx.insert(userTable).values(userRecords);
}

export interface BulkCreateResult {
	userIds: string[];
	locationIds: string[];
	locationJobData: Array<{
		locationId: string;
		address: string;
		email: string;
		type: 'location';
	}>;
	candidateJobData?: Array<{
		candidateId: string;
		address: string;
		email: string;
		type: 'candidate';
	}>;
}

export async function bulkCreateClients(tx: any, users: ImportUser[]): Promise<BulkCreateResult> {
	const hashedPassword = await new Argon2id().hash('dtssclientuser');

	const userRecords: User[] = [];
	const profileRecords: ClientProfile[] = [];
	const companyRecords: ClientCompany[] = [];
	const locationRecords: ClientCompanyLocation[] = [];
	const locationJobData: Array<{
		locationId: string;
		address: string;
		email: string;
		type: 'location';
	}> = [];

	for (const user of users) {
		const userId = crypto.randomUUID();
		const profileId = crypto.randomUUID();
		const companyId = crypto.randomUUID();
		const locationId = crypto.randomUUID();

		userRecords.push({
			id: userId,
			createdAt: new Date(),
			updatedAt: new Date(),
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			role: 'CLIENT' as const,
			completedOnboarding: true,
			verified: true,
			receiveEmail: true,
			provider: '',
			providerId: '',
			avatarUrl: null,
			onboardingStep: null,
			blacklisted: false,
			stripeCustomerId: null,
			timezone: null, // Will be updated by geocoding job
			token: crypto.randomUUID(),
			password: hashedPassword
		});

		profileRecords.push({
			id: profileId,
			createdAt: new Date(),
			updatedAt: new Date(),
			userId: userId
		});

		companyRecords.push({
			id: companyId,
			createdAt: new Date(),
			updatedAt: new Date(),
			clientId: profileId,
			companyName: user.companyName || `${user.firstName} ${user.lastName} Company`,
			companyLogo: user.companyLogo || null,
			baseLocation: user.baseLocation || null
		});

		if (user.address) {
			locationRecords.push({
				id: locationId,
				createdAt: new Date(),
				updatedAt: new Date(),
				email: user.email,
				streetOne: user.address || null,
				streetTwo: null,
				city: null,
				state: null,
				zipcode: null,
				companyPhone: null,
				cellPhone: null,
				companyId: companyId,
				name: `${user.companyName || user.firstName} - Main Location`,
				timezone: 'America/New_York', // Default, will be updated
				lat: null, // Will be updated by geocoding job
				lon: null, // Will be updated by geocoding job
				completeAddress: user.address || null,
				operatingHours: null
			});

			// Store job data for background geocoding
			locationJobData.push({
				locationId,
				address: user.address,
				email: user.email,
				type: 'location' as const
			});
		}
	}

	// Bulk insert in order (respecting foreign keys)
	await tx.insert(userTable).values(userRecords);
	await tx.insert(clientProfileTable).values(profileRecords);
	await tx.insert(clientCompanyTable).values(companyRecords);
	if (locationRecords.length > 0) {
		await tx.insert(companyOfficeLocationTable).values(locationRecords);
	}

	return {
		userIds: userRecords.map((u) => u.id),
		locationIds: locationRecords.map((l) => l.id),
		locationJobData
	};
}

export async function bulkCreateCandidates(
	tx: any,
	users: ImportUser[]
): Promise<BulkCreateResult> {
	const hashedPassword = await new Argon2id().hash('dtssprofessionaluser');
	const userRecords: User[] = [];
	const candidateRecords: CandidateProfile[] = [];
	const candidateExperienceRecords: CandidateDisciplineExperience[] = [];
	const candidateJobData: Array<{
		candidateId: string;
		address: string;
		email: string;
		type: 'candidate';
	}> = [];

	console.log(`Bulk creating ${users.length} candidates...`);

	for (const user of users) {
		const userId = crypto.randomUUID();
		const candidateId = crypto.randomUUID();

		// Create user record
		const newUser = {
			id: userId,
			createdAt: new Date(),
			updatedAt: new Date(),
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			role: 'CANDIDATE' as const,
			completedOnboarding: true,
			verified: true,
			receiveEmail: true,
			provider: '',
			providerId: '',
			avatarUrl: null,
			onboardingStep: null,
			blacklisted: false,
			stripeCustomerId: null,
			timezone: null, // Will be updated by geocoding
			token: crypto.randomUUID(),
			password: hashedPassword
		};

		userRecords.push(newUser);

		// Create candidate profile record
		const newCandidate = {
			id: candidateId,
			createdAt: new Date(),
			updatedAt: new Date(),
			userId,
			address: user.address || null,
			completeAddress: user.address || null,
			lat: null, // Will be updated by geocoding
			lon: null, // Will be updated by geocoding
			candidateStatus: 'PENDING' as const,
			approved: false,
			featureMe: false,
			avgRating: 0,
			citizenship: null,
			employeeNumber: null,
			regionId: null,
			geom: null
		};

		candidateRecords.push(newCandidate);

		// Queue for geocoding if address exists
		if (user.address && user.address.trim()) {
			candidateJobData.push({
				candidateId,
				address: user.address,
				email: user.email,
				type: 'candidate' as const
			});
		}

		// Handle disciplines if provided
		if (user.discipline) {
			const disciplineData = user.discipline
				.split(',')
				.map((d) => d.trim())
				.filter((d) => d.length > 0);

			if (disciplineData.length > 0) {
				// Get discipline IDs from abbreviations
				const disciplines = await db
					.select({
						id: disciplineTable.id,
						abbr: disciplineTable.abbreviation
					})
					.from(disciplineTable)
					.where(inArray(disciplineTable.abbreviation, disciplineData));

				// Create experience records for each discipline
				for (const discipline of disciplines) {
					candidateExperienceRecords.push({
						candidateId: candidateId,
						experienceLevelId: 'a7b0660b-a3a2-4ae3-96f5-0ec42237530e', // default 4-5 years
						createdAt: new Date(),
						updatedAt: new Date(),
						disciplineId: discipline.id
					});
				}

				// Log if some disciplines weren't found
				if (disciplines.length !== disciplineData.length) {
					const foundAbbrs = disciplines.map((d) => d.abbr);
					const notFound = disciplineData.filter((abbr) => !foundAbbrs.includes(abbr));
					if (notFound.length > 0) {
						console.warn(`Disciplines not found for ${user.email}:`, notFound);
					}
				}
			}
		}
	}

	console.log(`Inserting ${userRecords.length} users...`);
	await tx.insert(userTable).values(userRecords);

	console.log(`Inserting ${candidateRecords.length} candidate profiles...`);
	await tx.insert(candidateProfileTable).values(candidateRecords);

	if (candidateExperienceRecords.length > 0) {
		console.log(`Inserting ${candidateExperienceRecords.length} discipline experience records...`);
		await tx.insert(candidateDisciplineExperienceTable).values(candidateExperienceRecords);
	}

	console.log(`Bulk create complete. ${candidateJobData.length} candidates queued for geocoding.`);

	return {
		userIds: userRecords.map((u) => u.id),
		locationIds: [],
		locationJobData: [],
		candidateJobData
	};
}
