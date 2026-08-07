/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	and,
	asc,
	count,
	eq,
	or,
	sql,
	desc,
	isNotNull,
	gte,
	lte,
	SQL,
	ilike,
	inArray,
	gt,
	lt,
	like,
	ne,
	notInArray,
	isNull
} from 'drizzle-orm';
import db from '../drizzle';
import {
	recurrenceDayTable,
	requisitionTable,
	type Requisition,
	type RecurrenceDay,
	type UpdateRecurrenceDay,
	type UpdateRequisition,
	requisitionApplicationTable,
	timeSheetTable,
	timesheetExpenseTable,
	type RequisitionApplication,
	type RecurrenceDaySelect,
	workdayTable,
	invoiceTable,
	paperInvoiceTransactionTable,
	type Workday,
	type InvoiceWithRelations,
	type TimesheetWithRelations,
	type TimeSheetSelect,
	type TimesheetExpense,
	type TimesheetExpenseSelect,
	type WorkdaySelect,
	type RequisitionSelect,
	type InvoiceStatus,
	type InvoiceSourceType,
	type Invoice,
	type UpdateTimeSheet
} from '../schemas/requisition';
import { userTable, type User } from '../schemas/auth';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable
} from '../schemas/client';
import {
	disciplineTable,
	experienceLevelTable,
	type Discipline,
	type ExperienceLevel
} from '../schemas/skill';
import {
	candidateProfileTable,
	candidateDisciplineExperienceTable,
	type CandidateProfile,
	type CandidateProfileSelect,
	candidateDocumentUploadsTable
} from '../schemas/candidate';
import { alias } from 'drizzle-orm/pg-core';
import { error } from '@sveltejs/kit';
import { writeActionHistory } from './admin';
import { normalizeDate } from '$lib/_helpers';
import type Stripe from 'stripe';
import { calculateMaxHours, toUTCDateString } from '$lib/_helpers/UTCTimezoneUtils';
import { toZonedTime } from 'date-fns-tz';
import { voidStripeInvoice } from '$lib/server/stripe';
import { DEFAULT_MAX_RECORD_LIMIT } from '$lib/config/constants';
import { actionHistoryTable } from '../schemas/admin';
import { logger } from '$lib/server/logger';

/**
 * Candidate columns safe to attach to timesheet payloads.
 *
 * Several of these queries are CLIENT-facing (getTimesheetDetails,
 * getAllTimesheetsForClient, getClientTimesheets, ...), so spreading the whole
 * candidate_profiles row shipped a professional's ssnLast4, birthday, home
 * address and geo coordinates to the practice in the page data. Only the fields
 * the timesheet UI actually renders belong here — add deliberately, and check
 * who consumes the query before you do.
 */
const candidateTimesheetColumns = {
	id: candidateProfileTable.id,
	userId: candidateProfileTable.userId,
	status: candidateProfileTable.status,
	puid: candidateProfileTable.puid,
	cellPhone: candidateProfileTable.cellPhone,
	workersCompCode: candidateProfileTable.workersCompCode,
	createdAt: candidateProfileTable.createdAt
};

// Types and Interfaces
export interface TimesheetDiscrepancy {
	timeSheetId?: string;
	candidateId?: string;
	requisitionId?: number | null;
	clientCompanyName?: string | null;
	weekBeginDate?: string;
	discrepancyType: TimesheetDiscrepancyType;
	details: string;
	hoursDiscrepancy?: number;
	hoursRaw?: Record<string, number>[];
	candidate?: string | null;
	status?: string;
}

export enum TimesheetDiscrepancyType {
	HOURS_MISMATCH = 'HOURS_MISMATCH',
	MISSING_RATE = 'MISSING_RATE',
	INVALID_HOURS = 'INVALID_HOURS',
	// VALIDATION_MISSING = 'VALIDATION_MISSING',
	// SIGNATURE_MISSING = 'SIGNATURE_MISSING',
	UNAUTHORIZED_WORKDAY = 'UNAUTHORIZED_WORKDAY'
}

export interface Timesheet {
	timeSheetId?: string;
	createdAt?: Date;
	updatedAt?: Date;
	totalHoursWorked?: string | null;
	totalHoursBilled?: string | null;
	weekBeginDate: string;
	requisitionId?: number | null;
	clientCompanyName: string | null;
	validated: boolean | null;
	awaitingClientSignature: boolean | null;
	hourlyRate: number | null;
	hoursRaw: {
		date: string;
		workdayId?: string;
		recurrenceDayId?: string;
		startTime: string;
		endTime: string;
		hours: number;
	}[];
	status: string;
	candidate:
		| (CandidateProfileSelect & {
				email?: string;
				firstName?: string;
				lastName?: string;
				avatarUrl?: string | null;
		  })
		| null;
}

export type RequisitionDetailsRaw = {
	id: number;
	created_at: string;
	updated_at: string;
	status: 'PENDING' | 'OPEN' | 'FILLED' | 'UNFULFILLED' | 'CANCELED';
	name: string;
	client_id: string;
	location_id: string;
	discipline_id: string;
	job_description: string;
	special_instructions: string | null;
	experience_level_id: string | null;
	hourly_rate: number | null;
	company_id: string;
	location_name: string;
	company_name: string;
	first_name: string;
	last_name: string;
	email: string;
	discipline_name: string;
	permanent_position: boolean;
};
export type RequisitionResults = RequisitionDetailsRaw[];

export type ApplicationResults = {
	application: RequisitionApplication;
	candidateProfile: CandidateProfile;
	discipline: Discipline;
	experienceLevel: ExperienceLevel;
	user: Partial<User>;
};

export type TimeSheetResults = {
	user: Partial<User>;
	timeSheet: TimeSheetSelect;
	candidateProfile: CandidateProfile;
};

export type PaperInvoiceLineItem = {
	id: string;
	description: string | null;
	quantity: number;
	rate: number; // rate in cents - mirrors Stripe
	unit_amount: number; // rate in cents - mirrors Stripe
	unit_amount_excluding_tax: number;
	amount: number; // total in cents - mirrors Stripe
	currency: string;
	type: 'paper'; // discriminator
};

export type InvoiceLineItem = Stripe.InvoiceLineItem | PaperInvoiceLineItem;

export type WagesStatus = 'WAGES_DUE' | 'WAGES_PAID' | null;

export async function getAllRequisitions() {
	return await db.select().from(requisitionTable).where(eq(requisitionTable.archived, false));
}

export async function getRequisitionsForClient(
	companyId: string,
	searchTerm?: string,
	locationIds?: string[] | null
) {
	// CLIENT_STAFF scoping convention:
	//   undefined/null → no scoping
	//   []             → empty result (staff has no assignments)
	//   [ids...]       → filter to requisitions in those locations
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
	try {
		const results = await db
			.select({
				id: requisitionTable.id,
				title: requisitionTable.title,
				status: requisitionTable.status,
				createdAt: requisitionTable.createdAt,
				updatedAt: requisitionTable.updatedAt,
				hourlyRate: requisitionTable.hourlyRate,
				permanentPosition: requisitionTable.permanentPosition,
				jobDescription: requisitionTable.jobDescription,
				specialInstructions: requisitionTable.specialInstructions,
				referenceTimezone: requisitionTable.referenceTimezone,
				locationId: companyOfficeLocationTable.id,
				locationName: companyOfficeLocationTable.name,
				companyId: companyOfficeLocationTable.companyId,
				companyName: clientCompanyTable.companyName,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				disciplineName: disciplineTable.name
			})
			.from(requisitionTable)
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(
				clientCompanyTable,
				eq(companyOfficeLocationTable.companyId, clientCompanyTable.id)
			)
			.innerJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
			.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(requisitionTable.companyId, companyId),
					eq(requisitionTable.archived, false),
					Array.isArray(locationIds)
						? inArray(requisitionTable.locationId, locationIds)
						: undefined,
					or(
						searchTerm ? ilike(requisitionTable.title, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(userTable.firstName, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(userTable.lastName, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(disciplineTable.name, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(companyOfficeLocationTable.name, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(clientCompanyTable.companyName, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(companyOfficeLocationTable.city, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(companyOfficeLocationTable.state, `%${searchTerm}%`) : undefined,
						searchTerm ? eq(requisitionTable.id, parseInt(searchTerm)) : undefined
					)
				)
			)
			.orderBy(desc(requisitionTable.createdAt))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		if (results.length === 0) return [];

		const requisitionIds = results.map((r) => r.id);

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

		return results.map((row) => ({
			...row,
			recurrenceDays: recurrenceByRequisition.get(row.id) ?? []
		}));
	} catch (err) {
		console.error('Error fetching requisitions for client:', err);
		throw err;
	}
}

export async function getRequisitionsAdmin(searchTerm?: string) {
	try {
		const results = await db
			.select({
				id: requisitionTable.id,
				title: requisitionTable.title,
				status: requisitionTable.status,
				createdAt: requisitionTable.createdAt,
				updatedAt: requisitionTable.updatedAt,
				hourlyRate: requisitionTable.hourlyRate,
				permanentPosition: requisitionTable.permanentPosition,
				jobDescription: requisitionTable.jobDescription,
				specialInstructions: requisitionTable.specialInstructions,
				referenceTimezone: requisitionTable.referenceTimezone,
				locationId: companyOfficeLocationTable.id,
				locationName: companyOfficeLocationTable.name,
				locationAddress: companyOfficeLocationTable.completeAddress,
				companyId: companyOfficeLocationTable.companyId,
				companyName: clientCompanyTable.companyName,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				disciplineName: disciplineTable.name
			})
			.from(requisitionTable)
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(
				clientCompanyTable,
				eq(companyOfficeLocationTable.companyId, clientCompanyTable.id)
			)
			.innerJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
			.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.where(
				and(
					eq(requisitionTable.archived, false),
					or(
						searchTerm ? ilike(requisitionTable.title, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(userTable.firstName, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(userTable.lastName, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(disciplineTable.name, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(companyOfficeLocationTable.name, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(clientCompanyTable.companyName, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(companyOfficeLocationTable.city, `%${searchTerm}%`) : undefined,
						searchTerm ? ilike(companyOfficeLocationTable.state, `%${searchTerm}%`) : undefined,
						searchTerm ? eq(requisitionTable.id, parseInt(searchTerm)) : undefined
					)
				)
			)
			.orderBy(desc(requisitionTable.createdAt))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		if (results.length === 0) return [];

		const requisitionIds = results.map((r) => r.id);

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

		return results.map((row) => ({
			...row,
			recurrenceDays: recurrenceByRequisition.get(row.id) ?? []
		}));
	} catch (err) {
		console.error('Error fetching requisitions for admin:', err);
		throw err;
	}
}

export async function getRequisitionById(requisitionId: number): Promise<RequisitionSelect | null> {
	const [result] = await db
		.select()
		.from(requisitionTable)
		.where(and(eq(requisitionTable.id, requisitionId), eq(requisitionTable.archived, false)));

	if (!result) {
		return null;
	} else {
		return result;
	}
}

export async function getRequisitionDetailsByIdAdmin(requisitionId: number): Promise<any | null> {
	const [result] = await db
		.select({
			requisition: {
				...requisitionTable,
				company: {
					...clientCompanyTable,
					client: {
						...clientProfileTable,
						user: {
							avatarUrl: userTable.avatarUrl,
							firstName: userTable.firstName,
							lastName: userTable.lastName,
							email: userTable.email,
							id: userTable.id
						}
					}
				},
				location: { ...companyOfficeLocationTable },
				discipline: { ...disciplineTable },
				experienceLevel: { ...experienceLevelTable }
			}
		})
		.from(requisitionTable)
		.where(and(eq(requisitionTable.id, requisitionId), eq(requisitionTable.archived, false)))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.innerJoin(
			companyOfficeLocationTable,
			eq(companyOfficeLocationTable.id, requisitionTable.locationId)
		)
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.innerJoin(userTable, eq(userTable.id, clientProfileTable.userId))
		.leftJoin(experienceLevelTable, eq(experienceLevelTable.id, requisitionTable.experienceLevelId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId));

	if (!result) {
		return error(404, 'Requisition not found');
	} else {
		return { requisition: result.requisition };
	}
}

export async function getRequisitionDetailsForAdmin(id: number) {
	try {
		const [requisition] = await db
			.select({
				requisition: {
					...requisitionTable,
					company: {
						...clientCompanyTable,
						client: {
							...clientProfileTable,
							user: {
								avatarUrl: userTable.avatarUrl,
								firstName: userTable.firstName,
								lastName: userTable.lastName,
								email: userTable.email,
								id: userTable.id
							}
						}
					},
					location: { ...companyOfficeLocationTable },
					discipline: { ...disciplineTable },
					experienceLevel: { ...experienceLevelTable }
				}
			})
			.from(requisitionTable)
			.where(and(eq(requisitionTable.id, id), eq(requisitionTable.archived, false)))
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(companyOfficeLocationTable.id, requisitionTable.locationId)
			)
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(userTable, eq(userTable.id, clientProfileTable.userId))
			.leftJoin(
				experienceLevelTable,
				eq(experienceLevelTable.id, requisitionTable.experienceLevelId)
			)
			.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId));
		const applications = await db
			.select({
				application: requisitionApplicationTable,
				candidateProfile: candidateProfileTable,
				user: {
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				},
				disciplineExperience: candidateDisciplineExperienceTable,
				discipline: disciplineTable,
				experienceLevel: experienceLevelTable
			})
			.from(requisitionApplicationTable)
			.innerJoin(
				candidateProfileTable,
				eq(requisitionApplicationTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.leftJoin(
				candidateDisciplineExperienceTable,
				eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId)
			)
			.leftJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.leftJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(eq(requisitionApplicationTable.requisitionId, id));
		const timesheets = await db
			.select({
				user: {
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				},
				timeSheet: { ...timeSheetTable },
				candidateProfile: { ...candidateTimesheetColumns }
			})
			.from(timeSheetTable)
			.innerJoin(
				candidateProfileTable,
				eq(timeSheetTable.associatedCandidateId, candidateProfileTable.id)
			)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.where(eq(timeSheetTable.requisitionId, id));
		const recurrenceDays = await db
			.select()
			.from(recurrenceDayTable)
			.where(and(eq(recurrenceDayTable.requisitionId, id), eq(recurrenceDayTable.archived, false)))
			.orderBy(asc(recurrenceDayTable.date));

		console.log({ requisition, applications, timesheets, recurrenceDays });
		return { requisition, applications, timesheets, recurrenceDays };
	} catch (err) {
		console.error(err);
		throw error(500, 'Error fetching requisition details');
	}
}

export async function getRequisitionDetailsById(requisitionId: number): Promise<any | null> {
	const [result] = await db
		.select({
			requisition: {
				...requisitionTable,
				company: {
					...clientCompanyTable,
					client: {
						...clientProfileTable,
						user: {
							avatarUrl: userTable.avatarUrl,
							firstName: userTable.firstName,
							lastName: userTable.lastName,
							email: userTable.email,
							id: userTable.id
						}
					}
				},
				location: { ...companyOfficeLocationTable },
				discipline: { ...disciplineTable },
				experienceLevel: { ...experienceLevelTable }
			}
		})
		.from(requisitionTable)
		.where(and(eq(requisitionTable.id, requisitionId), eq(requisitionTable.archived, false)))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.innerJoin(
			companyOfficeLocationTable,
			eq(companyOfficeLocationTable.id, requisitionTable.locationId)
		)
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.innerJoin(userTable, eq(userTable.id, clientProfileTable.userId))
		.leftJoin(experienceLevelTable, eq(experienceLevelTable.id, requisitionTable.experienceLevelId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId));

	if (!result) {
		return error(404, 'Requisition not found');
	} else {
		return { requisition: result.requisition };
	}
}

export async function getRecurrenceDaysForRequisition(
	requisitionId: number
): Promise<RecurrenceDaySelect[] | null> {
	const result = await db
		.select()
		.from(recurrenceDayTable)
		.where(
			and(
				eq(recurrenceDayTable.requisitionId, requisitionId),
				eq(recurrenceDayTable.archived, false)
			)
		)
		.orderBy(asc(recurrenceDayTable.date));

	if (result.length === 0) {
		return [];
	} else {
		return result;
	}
}

export async function getRequsitionsForLocation(locationId: string) {
	return await db
		.select({
			id: requisitionTable.id,
			status: requisitionTable.status,
			title: requisitionTable.title,
			experienceLevel: experienceLevelTable.value,
			discipline: disciplineTable.name
		})
		.from(requisitionTable)
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.innerJoin(
			experienceLevelTable,
			eq(experienceLevelTable.id, requisitionTable.experienceLevelId)
		)
		.where(and(eq(requisitionTable.locationId, locationId), eq(requisitionTable.archived, false)));
}

export async function createRequisition(values: Requisition, userId: string) {
	try {
		const [result] = await db.insert(requisitionTable).values(values).returning();
		await writeActionHistory({
			table: 'REQUISITIONS',
			userId,
			action: 'CREATE',
			entityId: result.id.toString(),
			afterState: result
		});

		return result;
	} catch (err) {
		console.error('Error creating requisition', err);
		return error(500, 'Error creating requisition');
	}
}

export async function updateRequisition(
	requisitionId: number,
	values: UpdateRequisition,
	userId: string
) {
	try {
		const [result] = await db
			.update(requisitionTable)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(requisitionTable.id, requisitionId))
			.returning();

		await writeActionHistory({
			table: 'REQUISITIONS',
			userId,
			action: 'UPDATE',
			entityId: result.id.toString(),
			afterState: result
		});

		return result;
	} catch (err) {
		console.error('Error updating requisition', err);
		return error(500, 'Error updating requisition');
	}
}

export async function changeRequisitionStatus(
	values: UpdateRequisition,
	id: number,
	userId: string,
	tx?: any
) {
	const exec = tx || db;
	const [original] = await exec.select().from(requisitionTable).where(eq(requisitionTable.id, id));
	if (original) {
		const [update] = await exec
			.update(requisitionTable)
			.set(values)
			.where(eq(requisitionTable.id, original.id))
			.returning();

		await writeActionHistory({
			table: 'REQUISITIONS',
			userId,
			action: 'UPDATE',
			entityId: id.toString(),
			beforeState: original,
			afterState: update,
			metadata: { updatedField: 'STATUS' }
		});

		return update;
	} else {
		throw error(404, 'Requisition not found');
	}
}

export async function createNewRecurrenceDay(values: RecurrenceDay, userId: string) {
	try {
		const [result] = await db
			.insert(recurrenceDayTable)
			.values(values)
			.onConflictDoNothing()
			.returning();

		await writeActionHistory({
			table: 'RECURRENCE_DAYS',
			userId,
			action: 'CREATE',
			entityId: result.id,
			afterState: result
		});

		return result;
	} catch (err) {
		console.error('Error creating recurrence day', err);
		return error(500, 'Error creating recurrence day');
	}
}

/**
 * Find-or-reuse a recurrence day for (requisitionId, date), enforcing one active
 * row per date. There is at most one non-archived row per date:
 *  - if it's an active OPEN/FILLED day, a re-add is a no-op (don't clobber it);
 *  - if it's CANCELED (or only archived rows exist), that row is reopened in
 *    place — times refreshed, status reset, un-archived, and any prior workday
 *    assignment deleted — instead of inserting a duplicate.
 * This replaces the old createNewRecurrenceDay insert, whose `.onConflictDoNothing`
 * was dead code (no unique constraint) and which stacked a new row on every reopen.
 */
export async function findOrReuseRecurrenceDay(
	values: RecurrenceDay,
	userId: string
): Promise<{ row: RecurrenceDaySelect; outcome: 'inserted' | 'reopened' | 'noop-active' }> {
	try {
		return await db.transaction(async (tx) => {
			const existing = await tx
				.select()
				.from(recurrenceDayTable)
				.where(
					and(
						eq(recurrenceDayTable.requisitionId, Number(values.requisitionId)),
						eq(recurrenceDayTable.date, values.date)
					)
				);

			// An active (non-archived, non-canceled) row blocks a duplicate add.
			const active = existing.find((r) => !r.archived && r.status !== 'CANCELED');
			if (active) {
				return { row: active, outcome: 'noop-active' as const };
			}

			// Prefer reopening the surviving non-archived CANCELED row; else the most
			// recently archived row for this date.
			const reusable =
				existing.find((r) => !r.archived) ??
				existing.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

			if (reusable) {
				const [row] = await tx
					.update(recurrenceDayTable)
					.set({
						status: values.status,
						dayStart: values.dayStart,
						dayEnd: values.dayEnd,
						lunchStart: values.lunchStart,
						lunchEnd: values.lunchEnd,
						archived: false,
						archivedDate: null,
						updatedAt: new Date()
					})
					.where(eq(recurrenceDayTable.id, reusable.id))
					.returning();

				// Reopening clears any prior assignment so a stale workday doesn't
				// linger under the reopened day (matches the candidate-cancel convention).
				await tx.delete(workdayTable).where(eq(workdayTable.recurrenceDayId, reusable.id));

				await writeActionHistory({
					table: 'RECURRENCE_DAYS',
					userId,
					action: 'UPDATE',
					entityId: row.id,
					beforeState: reusable,
					afterState: row
				});

				return { row, outcome: 'reopened' as const };
			}

			const [row] = await tx.insert(recurrenceDayTable).values(values).returning();
			await writeActionHistory({
				table: 'RECURRENCE_DAYS',
				userId,
				action: 'CREATE',
				entityId: row.id,
				afterState: row
			});
			return { row, outcome: 'inserted' as const };
		});
	} catch (err) {
		console.error('Error creating/reusing recurrence day', err);
		return error(500, 'Error creating recurrence day');
	}
}

export async function editRecurrenceDay(id: string, values: UpdateRecurrenceDay, userId: string) {
	try {
		const [existing] = await db
			.select()
			.from(recurrenceDayTable)
			.where(eq(recurrenceDayTable.id, id));

		const result = await db
			.update(recurrenceDayTable)
			.set(values)
			.where(eq(recurrenceDayTable.id, id));

		await writeActionHistory({
			entityId: id,
			table: 'RECURRENCE_DAYS',
			userId,
			action: 'UPDATE',
			beforeState: existing,
			afterState: result
		});

		return result;
	} catch (error) {
		console.error(error);
	}
}

export async function deleteRecurrenceDay(id: string, userId: string) {
	try {
		return await db.transaction(async (tx) => {
			const [original] = await tx
				.select()
				.from(recurrenceDayTable)
				.where(eq(recurrenceDayTable.id, id));

			const [update] = await tx
				.update(recurrenceDayTable)
				// Also flip status to CANCELED (not just archived) so the row is
				// self-consistent: any query that filters on status alone still
				// excludes it, even if it forgets the archived check.
				.set({
					archived: true,
					archivedDate: new Date(),
					status: 'CANCELED',
					updatedAt: new Date()
				})
				.where(eq(recurrenceDayTable.id, id))
				.returning();

			// Soft-deleting the day must also retire its still-active workdays: flag
			// them cancelled (so the candidate calendar can still surface the lost
			// shift) and detach from any timesheet so they stop feeding the
			// timesheet-regeneration cron.
			await tx
				.update(workdayTable)
				.set({ cancelledAt: new Date(), timesheetId: null, updatedAt: new Date() })
				.where(and(eq(workdayTable.recurrenceDayId, id), isNull(workdayTable.cancelledAt)));

			await writeActionHistory({
				table: 'RECURRENCE_DAYS',
				userId,
				entityId: id,
				beforeState: original,
				afterState: update,
				action: 'DELETE'
			});

			return update;
		});
	} catch (error) {
		console.error('Error deleting recurrence day', error);
	}
}

export const getRecentRequisitionApplications = async (
	companyId: string | undefined,
	locationIds?: string[] | null
) => {
	if (!companyId) return error(400, 'Missing company id');
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
	try {
		// Requisition titles were replaced by discipline names in the UI, so we
		// join the requisition's own discipline (aliased separately from the
		// candidate-discipline join below) and surface it as `disciplineName`.
		const requisitionDiscipline = alias(disciplineTable, 'requisition_discipline');

		return await db
			.select({
				application: requisitionApplicationTable,
				candidateProfile: candidateProfileTable,
				user: {
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				},
				disciplineExperience: candidateDisciplineExperienceTable,
				discipline: disciplineTable,
				experienceLevel: experienceLevelTable,
				requisition: {
					id: requisitionTable.id,
					title: requisitionTable.title,
					disciplineName: requisitionDiscipline.name,
					permanentPosition: requisitionTable.permanentPosition
				}
			})
			.from(requisitionApplicationTable)
			.innerJoin(
				candidateProfileTable,
				eq(requisitionApplicationTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(
				requisitionTable,
				eq(requisitionApplicationTable.requisitionId, requisitionTable.id)
			)
			.innerJoin(requisitionDiscipline, eq(requisitionDiscipline.id, requisitionTable.disciplineId))
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.leftJoin(
				candidateDisciplineExperienceTable,
				and(
					eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId),
					eq(candidateDisciplineExperienceTable.disciplineId, requisitionTable.disciplineId)
				)
			)
			.leftJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.leftJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(
				and(
					eq(requisitionTable.permanentPosition, true),
					eq(requisitionTable.companyId, companyId),
					Array.isArray(locationIds) ? inArray(requisitionTable.locationId, locationIds) : undefined
				)
			)
			.orderBy(desc(requisitionApplicationTable.createdAt))
			.limit(5);
	} catch (err) {
		console.log(err);
		throw error(500, `${err}`);
	}
};

export const getRequisitionApplications = async (
	requisitionId: number | undefined,
	disciplineId?: string
) => {
	if (!requisitionId) return null;
	console.log(disciplineId);
	try {
		const filters: SQL[] = [eq(requisitionApplicationTable.requisitionId, requisitionId)];

		if (disciplineId)
			filters.push(eq(candidateDisciplineExperienceTable.disciplineId, disciplineId));

		// Build the base query
		const query = db
			.selectDistinctOn([candidateProfileTable.id], {
				application: requisitionApplicationTable,
				candidateProfile: candidateProfileTable,
				user: {
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				},
				disciplineExperience: candidateDisciplineExperienceTable,
				discipline: disciplineTable,
				experienceLevel: experienceLevelTable
			})
			.from(requisitionApplicationTable)
			.innerJoin(
				candidateProfileTable,
				eq(requisitionApplicationTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.leftJoin(
				candidateDisciplineExperienceTable,
				eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId)
			)
			.leftJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.leftJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(and(...filters));

		// Execute the query
		return await query;
	} catch (err) {
		console.log(err);
		throw error(500, `${err}`);
	}
};

export const getRequisitionApplicationDetails = async (
	requisitionId: number,
	applicationId: string
) => {
	try {
		// The candidate may have multiple discipline-experience rows. Filter the
		// join down to the requisition's own discipline so the rate range and
		// experience level returned here reflect what the candidate is applying
		// for. The candidate profile's hourlyRateMin/Max fields are deprecated;
		// pay range now lives on candidate_discipline_experience.
		const [application] = await db
			.select({
				application: requisitionApplicationTable,
				candidateProfile: candidateProfileTable,
				user: {
					id: userTable.id,
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				},
				disciplineExperience: candidateDisciplineExperienceTable,
				discipline: disciplineTable,
				experienceLevel: experienceLevelTable
			})
			.from(requisitionApplicationTable)
			.innerJoin(
				candidateProfileTable,
				eq(requisitionApplicationTable.candidateId, candidateProfileTable.id)
			)
			.innerJoin(
				requisitionTable,
				eq(requisitionApplicationTable.requisitionId, requisitionTable.id)
			)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.leftJoin(
				candidateDisciplineExperienceTable,
				and(
					eq(candidateProfileTable.id, candidateDisciplineExperienceTable.candidateId),
					eq(candidateDisciplineExperienceTable.disciplineId, requisitionTable.disciplineId)
				)
			)
			.leftJoin(
				disciplineTable,
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineTable.id)
			)
			.leftJoin(
				experienceLevelTable,
				eq(candidateDisciplineExperienceTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(
				and(
					eq(requisitionApplicationTable.id, applicationId),
					eq(requisitionApplicationTable.requisitionId, requisitionId)
				)
			);

		console.log('application', application);

		const [resume] = await db
			.select()
			.from(candidateDocumentUploadsTable)
			.where(
				and(
					eq(candidateDocumentUploadsTable.candidateId, application.candidateProfile.id),
					eq(candidateDocumentUploadsTable.type, 'RESUME')
				)
			)
			.orderBy(desc(candidateDocumentUploadsTable.createdAt))
			.limit(1);

		return { ...application, resume: resume || null };
	} catch (err) {
		console.log(err);
		throw error(500, `${err}`);
	}
};

export async function approveApplication(applicationId: string, userId: string) {
	try {
		const [application] = await db
			.select()
			.from(requisitionApplicationTable)
			.where(eq(requisitionApplicationTable.id, applicationId));

		if (!application) throw error(404, 'Application not found');

		const [result] = await db
			.update(requisitionApplicationTable)
			.set({ status: 'APPROVED', updatedAt: new Date() })
			.where(eq(requisitionApplicationTable.id, applicationId))
			.returning();

		const [requisition] = await db
			.select()
			.from(requisitionTable)
			.where(eq(requisitionTable.id, application.requisitionId));

		// Perm requisitions enter a payment-tracking branch instead of closing:
		// PAYMENT_REQUIRED → admin bills the client → admin manually flips to
		// PAYMENT_RECEIVED. Temp requisitions retain the existing CLOSED behavior.
		const nextStatus = requisition.permanentPosition ? 'PAYMENT_REQUIRED' : 'CLOSED';
		const [reqResult] = await db
			.update(requisitionTable)
			.set({ status: nextStatus })
			.where(eq(requisitionTable.id, requisition.id))
			.returning();

		await writeActionHistory({
			table: 'REQUISITION_APPLICATIONS',
			userId,
			action: 'UPDATE',
			entityId: applicationId,
			beforeState: application,
			afterState: result
		});

		await writeActionHistory({
			table: 'REQUISITIONS',
			userId,
			action: 'UPDATE',
			entityId: requisition.id.toString(),
			beforeState: requisition,
			afterState: reqResult
		});

		// Auto-deny rivals (perm only). Approving one perm application means
		// the position is spoken for — every other PENDING application on the
		// same req is automatically transitioned to DENIED and the caller is
		// expected to fire `notifyApplicationDenied` for each so those
		// candidates know to stop waiting. Temp claims don't have rival
		// applications (claiming flips the day directly to FILLED), so this
		// only matters for perm.
		let autoDeniedAppIds: string[] = [];
		if (requisition.permanentPosition) {
			const rivals = await db
				.select({ id: requisitionApplicationTable.id })
				.from(requisitionApplicationTable)
				.where(
					and(
						eq(requisitionApplicationTable.requisitionId, requisition.id),
						eq(requisitionApplicationTable.status, 'PENDING'),
						ne(requisitionApplicationTable.id, applicationId)
					)
				);
			autoDeniedAppIds = rivals.map((r) => r.id);

			if (autoDeniedAppIds.length > 0) {
				await db
					.update(requisitionApplicationTable)
					.set({ status: 'DENIED', updatedAt: new Date() })
					.where(inArray(requisitionApplicationTable.id, autoDeniedAppIds));

				// One audit row per auto-denial so the per-application history
				// captures the transition (and the `autoDenied` marker tells a
				// reviewer it wasn't a manual admin decision).
				for (const rivalId of autoDeniedAppIds) {
					await writeActionHistory({
						table: 'REQUISITION_APPLICATIONS',
						userId,
						action: 'UPDATE',
						entityId: rivalId,
						beforeState: { status: 'PENDING' },
						afterState: { status: 'DENIED', autoDenied: true }
					});
				}
			}
		}

		return { approved: result, autoDeniedAppIds };
	} catch (err) {
		console.log(err);
		throw error(500, `${err}`);
	}
}

export async function denyApplication(applicationId: string, userId: string) {
	try {
		const [application] = await db
			.select()
			.from(requisitionApplicationTable)
			.where(eq(requisitionApplicationTable.id, applicationId));

		if (!application) throw error(404, 'Application not found');

		const [result] = await db
			.update(requisitionApplicationTable)
			.set({ status: 'DENIED', updatedAt: new Date() })
			.where(eq(requisitionApplicationTable.id, applicationId))
			.returning();

		await writeActionHistory({
			table: 'REQUISITION_APPLICATIONS',
			userId,
			action: 'UPDATE',
			entityId: applicationId,
			beforeState: application,
			afterState: result
		});

		return result;
	} catch (err) {
		console.log(err);
		throw error(500, `${err}`);
	}
}

export async function getRequisitionTimesheets(requisitionId: number | undefined) {
	if (!requisitionId) return null;
	try {
		return await db
			.select({
				user: {
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				},
				timeSheet: { ...timeSheetTable },
				candidateProfile: { ...candidateTimesheetColumns }
			})
			.from(timeSheetTable)
			.innerJoin(
				candidateProfileTable,
				eq(timeSheetTable.associatedCandidateId, candidateProfileTable.id)
			)
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.where(eq(timeSheetTable.requisitionId, requisitionId));
	} catch (err) {
		throw error(500, `Failed to fetch timesheets: ${err}`);
	}
}

export async function getNewApplicationsCount(clientId: string, locationIds?: string[] | null) {
	if (Array.isArray(locationIds) && locationIds.length === 0) return 0;
	try {
		const [result] = await db
			.select({ count: count() })
			.from(requisitionApplicationTable)
			.leftJoin(
				requisitionTable,
				eq(requisitionTable.id, requisitionApplicationTable.requisitionId)
			)
			.where(
				and(
					eq(requisitionApplicationTable.clientId, clientId),
					eq(requisitionApplicationTable.status, 'PENDING'),
					Array.isArray(locationIds) ? inArray(requisitionTable.locationId, locationIds) : undefined
				)
			);

		return result.count;
	} catch (err) {
		console.log(err);
		return error(500, 'error getting new application count');
	}
}

export async function getRecentTimesheetsDueForClient(
	clientId: string,
	locationIds?: string[] | null
) {
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
	try {
		const result = await db
			.select({
				timesheet: { ...timeSheetTable },
				requisition: { ...requisitionTable, disciplineName: disciplineTable.name },
				candidate: {
					...candidateTimesheetColumns,
					firstName: userTable.firstName,
					lastName: userTable.lastName
				}
			})
			.from(timeSheetTable)
			.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
			.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, timeSheetTable.associatedCandidateId)
			)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.where(
				and(
					eq(timeSheetTable.associatedClientId, clientId),
					eq(timeSheetTable.status, 'PENDING'),
					isNull(timeSheetTable.wagesStatus),
					Array.isArray(locationIds) ? inArray(requisitionTable.locationId, locationIds) : undefined
				)
			);

		return result;
	} catch (err) {
		console.log(err);
		return error(500, 'Error feching timesheets due count');
	}
}

export async function getAllTimesheetsAdmin(searchTerm?: string) {
	try {
		const result = await db
			.select({
				timesheet: {
					...timeSheetTable,
					hourlyRate: requisitionTable.hourlyRate
				},
				requisition: { ...requisitionTable, disciplineName: disciplineTable.name },
				clientCompany: { ...clientCompanyTable },
				candidate: {
					...candidateTimesheetColumns,
					firstName: userTable.firstName,
					lastName: userTable.lastName
				}
			})
			.from(timeSheetTable)
			.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
			.leftJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, timeSheetTable.associatedCandidateId)
			)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.where(
				searchTerm
					? or(
							ilike(requisitionTable.title, `%${searchTerm}%`),
							ilike(clientCompanyTable.companyName, `%${searchTerm}%`),
							ilike(userTable.firstName, `%${searchTerm}%`),
							ilike(userTable.lastName, `%${searchTerm}%`)
						)
					: undefined
			)
			.orderBy(desc(timeSheetTable.createdAt))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		return result || [];
	} catch (err) {
		console.log(err);
		return error(500, 'Error fetching timesheets');
	}
}

export async function getAllTimesheetsForClient(
	clientId: string | undefined,
	searchTerm?: string,
	locationIds?: string[] | null
) {
	if (!clientId) throw new Error('Client ID required');
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
	try {
		const result = await db
			.select({
				timesheet: {
					...timeSheetTable,
					hourlyRate: requisitionTable.hourlyRate
				},
				requisition: { ...requisitionTable, disciplineName: disciplineTable.name },
				candidate: {
					...candidateTimesheetColumns,
					firstName: userTable.firstName,
					lastName: userTable.lastName
				}
			})
			.from(timeSheetTable)
			.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
			.leftJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.innerJoin(
				candidateProfileTable,
				eq(candidateProfileTable.id, timeSheetTable.associatedCandidateId)
			)
			.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
			.leftJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientId))
			.where(
				and(
					eq(timeSheetTable.associatedClientId, clientId),
					notInArray(timeSheetTable.status, ['DRAFT']),
					Array.isArray(locationIds)
						? inArray(requisitionTable.locationId, locationIds)
						: undefined,
					searchTerm
						? or(
								ilike(requisitionTable.title, `%${searchTerm}%`),
								ilike(clientCompanyTable.companyName, `%${searchTerm}%`),
								ilike(userTable.firstName, `%${searchTerm}%`),
								ilike(userTable.lastName, `%${searchTerm}%`)
							)
						: undefined
				)
			);

		return result || [];
	} catch (err) {
		console.log(err);
		return error(500, 'Error fetching timesheets');
	}
}

export async function getTimesheetsDueCount(clientId: string, locationIds?: string[] | null) {
	if (Array.isArray(locationIds) && locationIds.length === 0) return 0;
	try {
		const [result] = await db
			.select({ count: count() })
			.from(timeSheetTable)
			.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
			.where(
				and(
					eq(timeSheetTable.associatedClientId, clientId),
					eq(timeSheetTable.status, 'PENDING'),
					Array.isArray(locationIds) ? inArray(requisitionTable.locationId, locationIds) : undefined
				)
			);

		return result.count || 0;
	} catch (err) {
		console.log('error getting timesheet count');
		console.log(err);
		return error(500, 'Error feching timesheets due count');
	}
}

//admin
export async function getAllTimesheetDiscrepancies() {
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
				...candidateTimesheetColumns,
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
		.where(eq(timeSheetTable.status, 'DISCREPANCY'));

	return timesheets;
}

export async function getClientCompanyTimesheetDiscrepancies(
	clientProfileId: string,
	locationIds?: string[] | null
) {
	if (Array.isArray(locationIds) && locationIds.length === 0) return [];
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
			// workdayId removed
			status: timeSheetTable.status,
			candidate: {
				...candidateTimesheetColumns,
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
		.where(
			and(
				eq(clientProfileTable.id, clientProfileId),
				eq(timeSheetTable.status, 'DISCREPANCY'),
				Array.isArray(locationIds) ? inArray(requisitionTable.locationId, locationIds) : undefined
			)
		);

	return timesheets;
}

export async function getWorkdaysForRecurrenceDays(recurrenceDayIds: string[]) {
	try {
		return await db
			.select()
			.from(workdayTable)
			.where(inArray(workdayTable.recurrenceDayId, recurrenceDayIds));
	} catch (error) {
		console.error('Error fetching workdays:', error);
		return [];
	}
}

export async function getRecurrenceDaysForTimesheet(
	timesheet: TimeSheetSelect | { timeSheetId: string; [key: string]: any }
): Promise<RecurrenceDaySelect[]> {
	const timesheetId =
		'timeSheetId' in timesheet && timesheet.timeSheetId
			? timesheet.timeSheetId
			: (timesheet as TimeSheetSelect).id;

	return await db
		.select({
			id: recurrenceDayTable.id,
			date: recurrenceDayTable.date,
			dayStart: recurrenceDayTable.dayStart,
			dayEnd: recurrenceDayTable.dayEnd,
			lunchStart: recurrenceDayTable.lunchStart,
			lunchEnd: recurrenceDayTable.lunchEnd,
			createdAt: recurrenceDayTable.createdAt,
			updatedAt: recurrenceDayTable.updatedAt,
			status: recurrenceDayTable.status,
			requisitionId: recurrenceDayTable.requisitionId,
			archived: recurrenceDayTable.archived,
			archivedDate: recurrenceDayTable.archivedDate
		})
		.from(recurrenceDayTable)
		.innerJoin(workdayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
		.where(
			and(
				eq(workdayTable.timesheetId, timesheetId),
				// Cancelled workdays are kept in the DB for visibility on the
				// candidate calendar but must not count toward timesheet hours.
				isNull(workdayTable.cancelledAt)
			)
		)
		.orderBy(asc(recurrenceDayTable.date));
}

export async function getTimesheetById(timesheetId: string): Promise<TimeSheetSelect | null> {
	try {
		const [timesheet] = await db
			.select()
			.from(timeSheetTable)
			.where(eq(timeSheetTable.id, timesheetId));

		return timesheet || null;
	} catch (err) {
		console.error('Error fetching timesheet by ID:', err);
		throw error(500, `Error fetching timesheet: ${err}`);
	}
}

export async function getTimesheetDetailsAdmin(timesheetId: string) {
	const [timesheet] = await db
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
			discrepancyNote: timeSheetTable.discrepancyNote,
			adjustedHourlyRate: timeSheetTable.adjustedHourlyRate,
			wagesStatus: timeSheetTable.wagesStatus,
			candidate: {
				...candidateTimesheetColumns,
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
		.where(eq(timeSheetTable.id, timesheetId));

	if (!timesheet) throw error(404, 'Timesheet not found');

	return timesheet;
}

export async function closeAllUpcomingRecurrenceDays(
	requisitionId: number | undefined,
	userId: string,
	tx?: any
) {
	const exec = tx || db;
	const beginningOfDay = new Date();
	beginningOfDay.setHours(0, 0, 0, 0); // Set to the start of the day
	const beginningOfDayString = beginningOfDay.toISOString().split('T')[0]; // Format as YYYY-MM-DD

	if (!requisitionId) throw error(400, 'Requisition ID is required');
	try {
		const result = await exec
			.update(recurrenceDayTable)
			.set({ status: 'CANCELED', updatedAt: new Date() })
			.where(
				and(
					eq(recurrenceDayTable.requisitionId, requisitionId),
					gt(recurrenceDayTable.date, beginningOfDayString),
					eq(recurrenceDayTable.status, 'OPEN')
				)
			)
			.returning();

		for (const day of result) {
			await writeActionHistory({
				table: 'RECURRENCE_DAYS',
				userId,
				action: 'UPDATE',
				entityId: day.id,
				beforeState: day,
				afterState: { ...day, status: 'CANCELED', updatedAt: new Date() }
			});
		}

		return result;
	} catch (err) {
		console.error('Error closing recurrence days:', err);
		throw error(500, `Error closing recurrence days: ${err}`);
	}
}

export async function getTimesheetDetails(timesheetId: string, clientId: string | undefined) {
	if (!clientId) throw error(400, 'Client ID required');
	const [timesheet] = await db
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
			discrepancyNote: timeSheetTable.discrepancyNote,
			adjustedHourlyRate: timeSheetTable.adjustedHourlyRate,
			candidate: {
				...candidateTimesheetColumns,
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
		.where(and(eq(timeSheetTable.id, timesheetId), eq(clientProfileTable.id, clientId)));

	if (!timesheet) throw error(404, 'Timesheet not found');

	return timesheet;
}

export async function getWorkdaysForTimesheet(timesheet: any) {
	const workdays = await db
		.select({
			workday: workdayTable,
			recurrenceDay: recurrenceDayTable
		})
		.from(workdayTable)
		.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
		.where(
			and(
				eq(workdayTable.timesheetId, timesheet.timeSheetId),
				// Skip cancelled workdays — they remain visible on the candidate
				// calendar but should not surface as hour entries.
				isNull(workdayTable.cancelledAt)
			)
		)
		.orderBy(recurrenceDayTable.date);

	return workdays;
}

/**
 * Submission/approval gate: returns the non-cancelled workdays LINKED TO THIS
 * timesheet whose shift has NOT yet ended (recurrenceDay.dayEnd in the future).
 * A timesheet becomes submittable/approvable once its own last linked shift has
 * ended — not once the whole calendar week is over. `dayEnd` is a timestamptz,
 * so comparing the instant in UTC already answers "has 5pm in the req timezone
 * passed?" — no timezone math needed.
 *
 * Late-added shifts are handled elsewhere by the reuse/reopen rules (APPROVED →
 * new sheet; PENDING → reopened to DRAFT), so they no longer need to block this
 * sheet by being counted here.
 */
export async function getUnfinishedWorkdaysForTimesheet(timesheetId: string) {
	const now = new Date();
	return db
		.select({ workday: workdayTable, recurrenceDay: recurrenceDayTable })
		.from(workdayTable)
		.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
		.where(
			and(
				eq(workdayTable.timesheetId, timesheetId),
				isNull(workdayTable.cancelledAt),
				gt(recurrenceDayTable.dayEnd, now)
			)
		);
}

/**
 * Submission gate (looser than the approval gate above): returns the
 * non-cancelled workdays LINKED TO THIS timesheet whose shift has NOT yet
 * STARTED (recurrenceDay.dayStart in the future). A timesheet becomes
 * submittable once its own last linked shift has STARTED — the prof/admin can
 * enter and submit hours for approval while the final shift is underway, rather
 * than waiting for it to end. `dayStart` is a timestamptz, so the instant
 * compare in UTC already answers "has the shift started in the req timezone?".
 *
 * Approval/billing stays gated on `dayEnd` via getUnfinishedWorkdaysForTimesheet.
 */
export async function getUnstartedWorkdaysForTimesheet(timesheetId: string) {
	const now = new Date();
	return db
		.select({ workday: workdayTable, recurrenceDay: recurrenceDayTable })
		.from(workdayTable)
		.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
		.where(
			and(
				eq(workdayTable.timesheetId, timesheetId),
				isNull(workdayTable.cancelledAt),
				gt(recurrenceDayTable.dayStart, now)
			)
		);
}

/**
 * Proactively links a freshly-created workday to the candidate's OPEN timesheet
 * for its requisition+week, if one exists — so shifts assigned after the
 * timesheet was created (or before the shift starts) land on the same timesheet
 * instead of fragmenting into a second one. Computes the week boundary the same
 * way as the cron. If the matched timesheet is already PENDING, it is reverted
 * to DRAFT so the newly added day's hours get (re)entered before resubmission.
 *
 * Pass a transaction `tx` to run inside the workday-insert transaction. Returns
 * the linked timesheetId, or null if no open timesheet exists (the cron will
 * create one once the shift starts).
 */
export async function linkWorkdayToOpenTimesheet(
	tx: any,
	args: {
		workdayId: string;
		candidateId: string;
		requisitionId: number;
		dayStart: Date;
		referenceTimezone: string | null | undefined;
	}
): Promise<string | null> {
	const weekBeginDate = computeWeekBeginDate(args.dayStart, args.referenceTimezone);

	const [existing] = await tx
		.select()
		.from(timeSheetTable)
		.where(
			and(
				eq(timeSheetTable.associatedCandidateId, args.candidateId),
				eq(timeSheetTable.requisitionId, args.requisitionId),
				eq(timeSheetTable.weekBeginDate, weekBeginDate),
				inArray(timeSheetTable.status, [...OPEN_TIMESHEET_STATUSES])
			)
		)
		.limit(1);

	if (!existing) return null;

	await tx
		.update(workdayTable)
		.set({ timesheetId: existing.id, updatedAt: new Date() })
		.where(eq(workdayTable.id, args.workdayId));

	// A new day was added to an already-submitted sheet — reopen it so the day's
	// hours can be entered and the sheet re-submitted/re-approved.
	if (existing.status === 'PENDING') {
		await tx
			.update(timeSheetTable)
			.set({ status: 'DRAFT', updatedAt: new Date() })
			.where(eq(timeSheetTable.id, existing.id));
	}

	return existing.id;
}

export const getWorkdayDetails = async (
	recurrenceDayId: string | undefined,
	companyId: string | undefined
) => {
	if (!companyId) return error(400, 'Missing company id');
	if (!recurrenceDayId) return error(400, 'Missing recurrence day id');

	try {
		const [result] = await db
			.select({
				// Workday details
				workday: workdayTable,

				// Candidate information
				candidate: {
					id: candidateProfileTable.id,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					email: userTable.email,
					phoneNumber: candidateProfileTable.cellPhone,
					avatarUrl: userTable.avatarUrl
				},
				// Timesheet information
				timesheet: {
					id: timeSheetTable.id,
					totalHoursWorked: timeSheetTable.totalHoursWorked,
					totalHoursBilled: timeSheetTable.totalHoursBilled,
					validated: timeSheetTable.validated,
					awaitingClientSignature: timeSheetTable.awaitingClientSignature,
					hoursRaw: timeSheetTable.hoursRaw,
					status: timeSheetTable.status,
					adjustedHourlyRate: timeSheetTable.adjustedHourlyRate
				}
			})
			.from(workdayTable)
			.innerJoin(candidateProfileTable, eq(workdayTable.candidateId, candidateProfileTable.id))
			.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
			.innerJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.leftJoin(
				experienceLevelTable,
				eq(requisitionTable.experienceLevelId, experienceLevelTable.id)
			)
			.leftJoin(timeSheetTable, eq(timeSheetTable.id, workdayTable.timesheetId))
			.where(
				and(
					eq(workdayTable.recurrenceDayId, recurrenceDayId),
					eq(requisitionTable.companyId, companyId)
				)
			);

		if (!result) {
			return null;
		}

		return result;
	} catch (err) {
		console.error('Error fetching workday details:', err);
		throw error(500, `Error fetching workday details: ${err}`);
	}
};

export const getRecurrenceDayDetails = async (
	recurrenceDayId: string,
	companyId: string | undefined
) => {
	if (!companyId) return error(400, 'Missing company id');

	try {
		const [result] = await db
			.select({
				recurrenceDay: { ...recurrenceDayTable },
				requisition: {
					id: requisitionTable.id,
					title: requisitionTable.title,
					companyId: requisitionTable.companyId,
					companyName: clientCompanyTable.companyName,
					locationId: requisitionTable.locationId,
					locationName: companyOfficeLocationTable.name,
					disciplineId: requisitionTable.disciplineId,
					disciplineName: disciplineTable.name,
					jobDescription: requisitionTable.jobDescription,
					specialInstructions: requisitionTable.specialInstructions,
					experienceLevelId: requisitionTable.experienceLevelId,
					experienceLevelName: experienceLevelTable.value,
					hourlyRate: requisitionTable.hourlyRate,
					status: requisitionTable.status,
					permanentPosition: requisitionTable.permanentPosition,
					referenceTimezone: requisitionTable.referenceTimezone
				}
			})
			.from(recurrenceDayTable)
			.innerJoin(requisitionTable, eq(recurrenceDayTable.requisitionId, requisitionTable.id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
			.innerJoin(
				companyOfficeLocationTable,
				eq(requisitionTable.locationId, companyOfficeLocationTable.id)
			)
			.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
			.leftJoin(
				experienceLevelTable,
				eq(requisitionTable.experienceLevelId, experienceLevelTable.id)
			)
			.where(eq(recurrenceDayTable.id, recurrenceDayId));

		if (!result) {
			throw error(404, 'Recurrence Day Not Found');
		}
		return result;
	} catch (err) {
		console.error('Error fetching recurrence day details:', err);
		throw error(500, `Error fetching recurrence day details: ${err}`);
	}
};

export function validateTimesheet(
	timesheet: Timesheet,
	recurrenceDays: RecurrenceDay[],
	workdays: Workday[]
): TimesheetDiscrepancy[] {
	const discrepancies: TimesheetDiscrepancy[] = [];
	// Create a mapping of workdays by recurrenceDayId for lookup
	const workdayMap = new Map(workdays.map((wd) => [wd.recurrenceDayId, wd]));
	// Direct lookups for the stable-key path (entries carrying a workdayId).
	const workdayById = new Map(workdays.map((wd) => [wd.id, wd]));
	const recurrenceDayById = new Map(recurrenceDays.map((rd) => [rd.id, rd]));

	// Group recurrence days by date for better lookup, keeping all IDs for each date
	const recurrenceDaysByDate = new Map();
	for (const rd of recurrenceDays) {
		const dateKey = normalizeDate(rd.date);
		if (!recurrenceDaysByDate.has(dateKey)) {
			recurrenceDaysByDate.set(dateKey, []);
		}
		recurrenceDaysByDate.get(dateKey).push(rd);
	}

	// Validate hours entries against recurrence days
	if (timesheet.hoursRaw && Array.isArray(timesheet.hoursRaw)) {
		for (const entry of timesheet.hoursRaw) {
			// console.log('Entry', entry);
			if (typeof entry.hours !== 'number' || entry.hours < 0) {
				discrepancies.push({
					...createBaseDiscrepancy(timesheet),
					discrepancyType: TimesheetDiscrepancyType.INVALID_HOURS,
					details: `Invalid hours value: ${entry.hours} for day ${entry.date}`
				});
				continue;
			}

			const entryDate = entry.date;
			// console.log(entryDate);
			const recurrenceDaysForDate = recurrenceDaysByDate.get(entryDate);

			// Validate against recurrence days
			if (!recurrenceDaysForDate || recurrenceDaysForDate.length === 0) {
				discrepancies.push({
					...createBaseDiscrepancy(timesheet),
					discrepancyType: TimesheetDiscrepancyType.UNAUTHORIZED_WORKDAY,
					details: `Hours submitted for ${entryDate} but no recurrence day scheduled`
				});
				continue;
			}

			// Validate against workdays. Prefer the entry's stable workdayId when
			// present — it pins the exact workday regardless of date, so an orphaned
			// entry (its workday unassigned/cancelled) is caught directly. Fall back
			// to the date→recurrence-day match for legacy entries without a key.
			let hasApprovedWorkday = false;
			let validRecurrenceDay = null;

			if (entry.workdayId) {
				const wd = workdayById.get(entry.workdayId);
				const rd = wd ? recurrenceDayById.get(wd.recurrenceDayId) : null;
				if (wd && rd) {
					hasApprovedWorkday = true;
					validRecurrenceDay = rd;
				}
			} else {
				for (const rd of recurrenceDaysForDate) {
					if (workdayMap.has(rd.id)) {
						hasApprovedWorkday = true;
						validRecurrenceDay = rd;
						break;
					}
				}
			}

			if (!hasApprovedWorkday) {
				discrepancies.push({
					...createBaseDiscrepancy(timesheet),
					discrepancyType: TimesheetDiscrepancyType.UNAUTHORIZED_WORKDAY,
					details: `Hours submitted for ${entryDate} but no approved workday exists`
				});
				continue;
			}

			// Validate hours against schedule
			const maxHours = calculateMaxHours(validRecurrenceDay);

			if (entry.hours > maxHours) {
				discrepancies.push({
					...createBaseDiscrepancy(timesheet),
					discrepancyType: TimesheetDiscrepancyType.INVALID_HOURS,
					details: `Hours (${entry.hours}) exceed maximum allowed (${maxHours}) for ${entryDate}`
				});
			}
		}

		// Validate total hours
		const totalSubmitted = timesheet.hoursRaw.reduce(
			(sum: number, entry: any) => sum + entry.hours,
			0
		);
		if (Math.abs(totalSubmitted - Number(timesheet.totalHoursWorked)) > 0.01) {
			discrepancies.push({
				...createBaseDiscrepancy(timesheet),
				discrepancyType: TimesheetDiscrepancyType.HOURS_MISMATCH,
				details: `Submitted hours (${totalSubmitted}) don't match total (${timesheet.totalHoursWorked})`,
				hoursDiscrepancy: Number(timesheet.totalHoursWorked) - totalSubmitted
			});
		}
	}

	// Add other basic validations
	validateBasicTimesheet(timesheet, discrepancies);

	return discrepancies;
}

// export function calculateMaxHours(recurrenceDay: any): number {
// 	if (!recurrenceDay) return 0;

// 	// Check which format we're dealing with
// 	if (recurrenceDay.dayStart) {
// 		// New format with dayStart property
// 		return calculateHours(recurrenceDay.dayStart, recurrenceDay.dayEnd);
// 	} else if (recurrenceDay.dayStartTime) {
// 		// Legacy format with dayStartTime property
// 		return calculateHours(recurrenceDay.dayStartTime, recurrenceDay.dayEndTime);
// 	}

// 	return 0;
// }

function validateBasicTimesheet(timesheet: Timesheet, discrepancies: TimesheetDiscrepancy[]): void {
	// Check for missing rates
	if (!timesheet.hourlyRate) {
		discrepancies.push({
			...createBaseDiscrepancy(timesheet),
			discrepancyType: TimesheetDiscrepancyType.MISSING_RATE,
			details: 'Missing hourly rate on requisition'
		});
	}

	// Check for validation status
	// if (!timesheet.validated) {
	// 	discrepancies.push({
	// 		...createBaseDiscrepancy(timesheet),
	// 		discrepancyType: TimesheetDiscrepancyType.VALIDATION_MISSING,
	// 		details: 'Timesheet has not been validated'
	// 	});
	// }

	// Check for signature status
	// if (timesheet.awaitingClientSignature) {
	// 	discrepancies.push({
	// 		...createBaseDiscrepancy(timesheet),
	// 		discrepancyType: TimesheetDiscrepancyType.SIGNATURE_MISSING,
	// 		details: 'Awaiting client signature'
	// 	});
	// }
}

function createBaseDiscrepancy(timesheet: Timesheet): Partial<TimesheetDiscrepancy> {
	return {
		timeSheetId: timesheet.timeSheetId,
		clientCompanyName: timesheet.clientCompanyName,
		candidateId: timesheet.candidate?.id,
		requisitionId: timesheet.requisitionId,
		weekBeginDate: timesheet.weekBeginDate,
		status: timesheet.status,
		candidate: timesheet.candidate
			? timesheet.candidate?.firstName + ' ' + timesheet.candidate?.lastName
			: 'Unknown Candidate'
	};
}

export function formatDiscrepancyForDisplay(
	discrepancies: TimesheetDiscrepancy[]
): Record<string, any>[] {
	return discrepancies.map((d) => ({
		timeSheetId: d.timeSheetId,
		clientCompanyName: d.clientCompanyName,
		candidateId: d.candidateId,
		requisitionId: d.requisitionId,
		weekBeginning: d.weekBeginDate,
		discrepancyType: d.discrepancyType,
		details: d.details,
		hoursDiscrepancy: d.hoursDiscrepancy ? Number(d.hoursDiscrepancy).toFixed(2) : undefined
	}));
}

export async function getClientTimesheets(
	clientId: string | undefined
): Promise<TimesheetWithRelations[]> {
	if (!clientId) throw error(400, 'Must provide client ID');

	const results = await db
		.select({
			timesheet: {
				id: timeSheetTable.id,
				createdAt: timeSheetTable.createdAt,
				updatedAt: timeSheetTable.updatedAt,
				status: timeSheetTable.status,
				weekBeginDate: timeSheetTable.weekBeginDate,
				totalHoursWorked: timeSheetTable.totalHoursWorked,
				totalHoursBilled: timeSheetTable.totalHoursBilled,
				hoursRaw: timeSheetTable.hoursRaw,
				validated: timeSheetTable.validated,
				awaitingClientSignature: timeSheetTable.awaitingClientSignature,
				requisitionId: timeSheetTable.requisitionId,
				associatedCandidateId: timeSheetTable.associatedCandidateId,
				associatedClientId: timeSheetTable.associatedClientId,
				discrepancyNote: timeSheetTable.discrepancyNote,
				adjustedHourlyRate: timeSheetTable.adjustedHourlyRate
			},
			candidate: { ...candidateTimesheetColumns },
			user: {
				id: userTable.email,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				avatarUrl: userTable.avatarUrl
			},
			requisition: requisitionTable,
			workday: workdayTable
		})
		.from(timeSheetTable)
		.where(eq(timeSheetTable.associatedClientId, clientId))
		.innerJoin(
			candidateProfileTable,
			eq(timeSheetTable.associatedCandidateId, candidateProfileTable.id)
		)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.leftJoin(requisitionTable, eq(timeSheetTable.requisitionId, requisitionTable.id))
		.leftJoin(workdayTable, eq(workdayTable.timesheetId, timeSheetTable.id))
		.orderBy(desc(timeSheetTable.weekBeginDate));

	if (!results.length) {
		return [];
	}

	return results;
}

export async function getClientInvoices(
	clientId: string | undefined,
	options?: {
		status?: InvoiceStatus;
		sourceType?: InvoiceSourceType;
		includeStripeData?: boolean;
		limit?: number;
		searchTerm?: string;
		locationIds?: string[] | null;
	}
): Promise<InvoiceWithRelations[]> {
	if (!clientId) throw error(400, 'Must provide client ID');
	if (Array.isArray(options?.locationIds) && options.locationIds.length === 0) return [];

	// Build dynamic where conditions
	const whereConditions: SQL[] = [eq(invoiceTable.clientId, clientId)];

	if (options?.status) {
		whereConditions.push(eq(invoiceTable.status, options.status));
	}

	if (options?.sourceType) {
		whereConditions.push(eq(invoiceTable.sourceType, options.sourceType));
	}

	// CLIENT_STAFF location scoping: only invoices whose linked requisition is
	// at one of the staff's assigned locations. Invoices without a requisition
	// (e.g. one-off manual paper invoices) are excluded under scoping.
	if (Array.isArray(options?.locationIds)) {
		whereConditions.push(inArray(requisitionTable.locationId, options.locationIds));
	}

	// Add search conditions
	if (options?.searchTerm) {
		whereConditions.push(
			or(
				ilike(invoiceTable.invoiceNumber, `%${options.searchTerm}%`),
				ilike(requisitionTable.title, `%${options.searchTerm}%`),
				ilike(
					sql`candidate_user
				.
				first_name`,
					`%${options.searchTerm}%`
				),
				ilike(
					sql`candidate_user
				.
				last_name`,
					`%${options.searchTerm}%`
				),
				ilike(clientCompanyTable.companyName, `%${options.searchTerm}%`)
			)
		);
	}

	const query = db
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
		.where(and(...whereConditions))
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
		.orderBy(desc(invoiceTable.createdAt));

	if (options?.limit) {
		query.limit(options.limit);
	}

	const results = await query;

	if (!results.length) {
		return [];
	}

	// Transform results to match the type structure
	return results.map((row) => ({
		invoice: row.invoice,
		candidate:
			row.candidateProfile && row.candidateUser
				? { profile: row.candidateProfile, user: row.candidateUser }
				: null,
		timesheet: row.timesheet,
		requisition: row.requisition,
		lineItems: (row.invoice.lineItems as InvoiceLineItem[]) || [],
		client: row.client,
		clientUser: row.clientUser,
		company: row.clientCompany
	}));
}

export async function getAllInvoicesAdmin(searchTerm?: string): Promise<InvoiceWithRelations[]> {
	try {
		const whereConditions: SQL[] = [];

		// Add search conditions if searchTerm is provided
		if (searchTerm) {
			whereConditions.push(
				or(
					ilike(invoiceTable.invoiceNumber, `%${searchTerm}%`),
					ilike(requisitionTable.title, `%${searchTerm}%`),
					ilike(
						sql`candidate_user
					.
					first_name`,
						`%${searchTerm}%`
					),
					ilike(
						sql`candidate_user
					.
					last_name`,
						`%${searchTerm}%`
					),
					ilike(clientCompanyTable.companyName, `%${searchTerm}%`)
				)
			);
		}

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
			.where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
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
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		return result.map((row) => ({
			invoice: row.invoice,
			candidate:
				row.candidateProfile && row.candidateUser
					? { profile: row.candidateProfile, user: row.candidateUser }
					: null,
			timesheet: row.timesheet,
			requisition: row.requisition,
			lineItems: (row.invoice.lineItems as InvoiceLineItem[]) || [],
			client: row.client,
			clientUser: row.clientUser,
			company: row.clientCompany
		}));
	} catch (err) {
		console.error('Error fetching all invoices:', err);
		throw error(500, `Error fetching all invoices: ${err}`);
	}
}

export async function getTimesheetInvoices(
	clientId: string,
	options?: { candidateId?: string; requisitionId?: number; status?: InvoiceStatus }
): Promise<InvoiceWithRelations[]> {
	const whereConditions = [
		eq(invoiceTable.clientId, clientId),
		eq(invoiceTable.sourceType, 'timesheet'),
		isNotNull(invoiceTable.timesheetId)
	];

	if (options?.candidateId) {
		whereConditions.push(eq(invoiceTable.candidateId, options.candidateId));
	}

	if (options?.requisitionId) {
		whereConditions.push(eq(invoiceTable.requisitionId, options.requisitionId));
	}

	if (options?.status) {
		whereConditions.push(eq(invoiceTable.status, options.status));
	}

	const results = await db
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
		.where(and(...whereConditions))
		.innerJoin(candidateProfileTable, eq(invoiceTable.candidateId, candidateProfileTable.id))
		.innerJoin(
			sql`${userTable}
			as candidate_user`,
			sql`${candidateProfileTable.userId}
			= candidate_user.id`
		)
		.innerJoin(timeSheetTable, eq(invoiceTable.timesheetId, timeSheetTable.id))
		.innerJoin(requisitionTable, eq(invoiceTable.requisitionId, requisitionTable.id))
		.innerJoin(clientProfileTable, eq(invoiceTable.clientId, clientProfileTable.id))
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.innerJoin(
			sql`${userTable}
		as client_user`,
			sql`${clientProfileTable.userId}
		= client_user.id`
		)
		.orderBy(desc(invoiceTable.createdAt));

	return results.map((row) => ({
		invoice: row.invoice,
		candidate: { profile: row.candidateProfile, user: row.candidateUser },
		timesheet: row.timesheet,
		requisition: row.requisition,
		lineItems: (row.invoice.lineItems as InvoiceLineItem[]) || [],
		client: row.client,
		clientUser: row.clientUser,
		company: row.clientCompany
	}));
}

export async function getManualInvoices(
	clientId: string,
	options?: { status?: InvoiceStatus; fromDate?: Date; toDate?: Date }
): Promise<InvoiceWithRelations[]> {
	const whereConditions = [
		eq(invoiceTable.clientId, clientId),
		or(eq(invoiceTable.sourceType, 'manual'), eq(invoiceTable.sourceType, 'other'))
	];

	if (options?.status) {
		whereConditions.push(eq(invoiceTable.status, options.status));
	}

	if (options?.fromDate) {
		whereConditions.push(gte(invoiceTable.createdAt, options.fromDate));
	}

	if (options?.toDate) {
		whereConditions.push(lte(invoiceTable.createdAt, options.toDate));
	}

	const results = await db
		.select({
			invoice: invoiceTable,
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
		.where(and(...whereConditions))
		.innerJoin(clientProfileTable, eq(invoiceTable.clientId, clientProfileTable.id))
		.innerJoin(clientCompanyTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.innerJoin(
			sql`${userTable}
		as client_user`,
			sql`${clientProfileTable.userId}
		= client_user.id`
		)
		.orderBy(desc(invoiceTable.createdAt));

	return results.map((row) => ({
		invoice: row.invoice,
		client: row.client,
		clientUser: row.clientUser,
		company: row.clientCompany,
		lineItems: (row.invoice.lineItems as InvoiceLineItem[]) || [],
		// These will be null for manual invoices
		candidate: null,
		timesheet: null,
		requisition: null
	}));
}

export async function getInvoiceByIdAdmin(invoiceId: string): Promise<InvoiceWithRelations | null> {
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
		.where(eq(invoiceTable.id, invoiceId))
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
		.innerJoin(clientCompanyTable, eq(clientProfileTable.id, clientCompanyTable.clientId))

		.innerJoin(
			sql`${userTable}
		as client_user`,
			sql`${clientProfileTable.userId}
		= client_user.id`
		)
		.limit(1);

	if (!result.length) {
		return null;
	}

	const row = result[0];
	return {
		invoice: row.invoice,
		candidate:
			row.candidateProfile && row.candidateUser
				? { profile: row.candidateProfile, user: row.candidateUser }
				: null,
		timesheet: row.timesheet,
		requisition: row.requisition,
		lineItems: (row.invoice.lineItems as InvoiceLineItem[]) || [],
		client: row.client,
		clientUser: row.clientUser,
		company: row.clientCompany
	};
}

export async function getInvoiceById(
	invoiceId: string,
	clientId: string | undefined
): Promise<InvoiceWithRelations | null> {
	if (!clientId) throw error(400, 'Client ID is required');
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
		.where(and(eq(invoiceTable.id, invoiceId), eq(invoiceTable.clientId, clientId)))
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
		.innerJoin(clientCompanyTable, eq(clientProfileTable.id, clientCompanyTable.clientId))

		.innerJoin(
			sql`${userTable}
		as client_user`,
			sql`${clientProfileTable.userId}
		= client_user.id`
		)
		.limit(1);

	if (!result.length) {
		return null;
	}

	const row = result[0];
	return {
		invoice: row.invoice,
		candidate:
			row.candidateProfile && row.candidateUser
				? { profile: row.candidateProfile, user: row.candidateUser }
				: null,
		timesheet: row.timesheet,
		requisition: row.requisition,
		lineItems: (row.invoice.lineItems as InvoiceLineItem[]) || [],
		client: row.client,
		clientUser: row.clientUser,
		company: row.clientCompany
	};
}

/**
 * Returns every paper-invoice transaction recorded against an invoice, oldest
 * first so the caller can render a top-to-bottom timeline.
 */
export async function getPaperTransactionsByInvoiceId(invoiceId: string) {
	try {
		return await db
			.select()
			.from(paperInvoiceTransactionTable)
			.where(eq(paperInvoiceTransactionTable.invoiceId, invoiceId))
			.orderBy(asc(paperInvoiceTransactionTable.createdAt));
	} catch (err) {
		console.error('Error fetching paper transactions:', err);
		return [];
	}
}

export async function getInvoicesWithStripeData(
	clientId: string,
	options?: { onlyWithStripeId?: boolean; status?: InvoiceStatus }
): Promise<(InvoiceWithRelations & { stripeData: any })[]> {
	const whereConditions = [eq(invoiceTable.clientId, clientId)];

	if (options?.onlyWithStripeId) {
		whereConditions.push(isNotNull(invoiceTable.stripeInvoiceId));
	}

	if (options?.status) {
		whereConditions.push(eq(invoiceTable.status, options.status));
	}

	const invoices = await getClientInvoices(clientId, {
		status: options?.status,
		includeStripeData: true
	});

	// Map invoices with their Stripe data
	return invoices.map((inv) => ({
		...inv,
		stripeData: {
			stripeInvoiceId: inv.invoice.stripeInvoiceId,
			stripeCustomerId: inv.invoice.stripeCustomerId,
			stripePdfUrl: inv.invoice.stripePdfUrl,
			stripeHostedUrl: inv.invoice.stripeHostedUrl,
			stripeStatus: inv.invoice.stripeStatus,
			currency: inv.invoice.currency,
			amountDue: inv.invoice.amountDue,
			amountPaid: inv.invoice.amountPaid,
			amountRemaining: inv.invoice.amountRemaining
		}
	}));
}

/**
 * Get a workday by its ID
 * @param workdayId The ID of the workday to fetch
 * @returns The workday or null if not found
 */
export async function getWorkdayById(workdayId: string): Promise<WorkdaySelect | null> {
	try {
		const [workday] = await db.select().from(workdayTable).where(eq(workdayTable.id, workdayId));

		return workday || null;
	} catch (err) {
		console.error('Error fetching workday:', err);
		throw error(500, `Error fetching workday: ${err}`);
	}
}

/**
 * Get requisition associated with a workday
 * @param workdayId The ID of the workday
 * @returns The requisition details or null if not found
 */
export async function getRequisitionByWorkdayId(
	workdayId: string
): Promise<RequisitionSelect | null> {
	try {
		// First get the workday to access its requisitionId
		const workday = await getWorkdayById(workdayId);

		if (!workday) {
			return null;
		}

		// Now get the requisition using the requisitionId from the workday
		const [requisition] = await db
			.select()
			.from(requisitionTable)
			.where(eq(requisitionTable.id, workday.requisitionId));

		return requisition || null;
	} catch (err) {
		console.error('Error fetching requisition by workday ID:', err);
		throw error(500, `Error fetching requisition: ${err}`);
	}
}

/**
 * Get recurrence day associated with a workday
 * @param workdayId The ID of the workday
 * @returns The recurrence day details or null if not found
 */
export async function getRecurrenceDayByWorkdayId(
	workdayId: string
): Promise<RecurrenceDaySelect | null> {
	try {
		// First get the workday to access its recurrenceDayId
		const workday = await getWorkdayById(workdayId);

		if (!workday || !workday.recurrenceDayId) {
			return null;
		}

		// Now get the recurrence day using the recurrenceDayId from the workday
		const [recurrenceDay] = await db
			.select()
			.from(recurrenceDayTable)
			.where(eq(recurrenceDayTable.id, workday.recurrenceDayId));

		return recurrenceDay || null;
	} catch (err) {
		console.error('Error fetching recurrence day by workday ID:', err);
		throw error(500, `Error fetching recurrence day: ${err}`);
	}
}

/**
 * Get both requisition and recurrence day associated with a workday in a single function
 * @param workdayId The ID of the workday
 * @returns Object containing the workday, requisition, and recurrence day
 */
export async function getWorkdayWithRelations(workdayId: string): Promise<{
	workday: WorkdaySelect | null;
	requisition: RequisitionSelect | null;
	recurrenceDay: RecurrenceDaySelect | null;
}> {
	try {
		const [result] = await db
			.select({
				workday: workdayTable,
				requisition: requisitionTable,
				recurrenceDay: recurrenceDayTable
			})
			.from(workdayTable)
			.where(eq(workdayTable.id, workdayId))
			.leftJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
			.leftJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id));

		if (!result) {
			return { workday: null, requisition: null, recurrenceDay: null };
		}

		return result;
	} catch (err) {
		console.error('Error fetching workday with relations:', err);
		throw error(500, `Error fetching workday with relations: ${err}`);
	}
}

/**
 * Get all workdays for a specific recurrence day
 * @param recurrenceDayId The ID of the recurrence day
 * @returns Array of workdays associated with the recurrence day
 */
export async function getWorkdaysByRecurrenceDayId(
	recurrenceDayId: string
): Promise<WorkdaySelect[]> {
	try {
		const workdays = await db
			.select()
			.from(workdayTable)
			.where(eq(workdayTable.recurrenceDayId, recurrenceDayId));

		return workdays;
	} catch (err) {
		console.error('Error fetching workdays by recurrence day ID:', err);
		throw error(500, `Error fetching workdays: ${err}`);
	}
}

export async function revertTimesheetToPending(timesheetId: string, userId: string | null) {
	try {
		const [original] = await db
			.select()
			.from(timeSheetTable)
			.where(eq(timeSheetTable.id, timesheetId));

		// NOTE: do NOT touch submittedAt here. This helper is only ever a
		// failure-rollback (a failed approve/reject flips back to PENDING) — not a
		// genuine resubmission. Resetting submittedAt on a transient invoicing
		// failure would push the 24h auto-approval window forward every time and
		// could defer auto-approval indefinitely. Real (re)submissions reset
		// submittedAt in their own submit handlers.
		// Fully undo what `approveTimesheet` set, not just the status. Otherwise a
		// failed approve (e.g. Stripe invoice throws) leaves the sheet PENDING but
		// still carrying WAGES_DUE, an approval timestamp/approver, and billed
		// hours — a contradictory state. Every caller of this helper is a
		// failure-rollback, so clearing the approval-derived fields is always
		// correct (a PENDING sheet should never have them set).
		const [result] = await db
			.update(timeSheetTable)
			.set({
				status: 'PENDING',
				wagesStatus: null,
				totalHoursBilled: null,
				approvedAt: null,
				approvedByUserId: null,
				updatedAt: new Date()
			})
			.where(eq(timeSheetTable.id, timesheetId))
			.returning();

		await writeActionHistory({
			table: 'TIMESHEETS',
			userId,
			action: 'UPDATE',
			entityId: timesheetId,
			beforeState: original,
			afterState: result,
			metadata: { status: 'PENDING' }
		});

		return result;
	} catch (err) {
		throw error(500, `Error rejecting timesheet: ${error}`);
	}
}

/**
 * Hard-deletes a timesheet that has NO invoice. Disconnects its workdays
 * (set timesheetId = NULL) first so they survive and can regenerate a fresh
 * timesheet via the proactive linker / cron. Throws if an invoice is linked —
 * callers must use {@link voidTimesheetWithInvoice} in that case.
 */
export async function deleteTimesheet(timesheetId: string, userId: string) {
	try {
		const existingInvoice = await getInvoiceByTimesheetId(timesheetId);
		if (existingInvoice) {
			throw error(409, 'Timesheet has an invoice — void it instead of deleting');
		}

		return await db.transaction(async (tx) => {
			const [original] = await tx
				.select()
				.from(timeSheetTable)
				.where(eq(timeSheetTable.id, timesheetId));

			if (!original) {
				throw error(404, 'Timesheet not found');
			}

			await tx
				.update(workdayTable)
				.set({ timesheetId: null, updatedAt: new Date() })
				.where(eq(workdayTable.timesheetId, timesheetId));

			await tx.delete(timeSheetTable).where(eq(timeSheetTable.id, timesheetId));

			await writeActionHistory({
				table: 'TIMESHEETS',
				userId,
				action: 'DELETE',
				entityId: timesheetId,
				beforeState: original,
				metadata: { reason: 'timesheet_deleted', disconnectedWorkdays: true }
			});

			return original;
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, `Error deleting timesheet: ${err}`);
	}
}

/**
 * Voids an APPROVED timesheet that has an invoice: voids the Stripe invoice
 * through Stripe (if any), sets the timesheet VOID, clears the wages status,
 * detaches the invoice's timesheetId, and disconnects the workdays so a corrected
 * timesheet can regenerate. Blocks if the invoice is already paid.
 *
 * NOTE: this does NOT flip the invoice's own status to void or email the client —
 * the caller must follow up with `voidInvoiceAndNotify(invoice.id, reason)` (the
 * single notify-once gate). Returns the linked invoice id so callers can do so.
 */
export async function voidTimesheetWithInvoice(timesheetId: string, userId: string) {
	const invoice = await getInvoiceByTimesheetId(timesheetId);
	if (!invoice) {
		throw error(409, 'No invoice linked to this timesheet — use delete instead');
	}
	if (invoice.status === 'paid') {
		throw error(409, 'Invoice is already paid — a refund is required, not a void');
	}

	// Void the Stripe invoice OUTSIDE the DB transaction so a Stripe failure
	// doesn't leave us half-committed. If Stripe rejects (e.g. paid race), we
	// abort before touching our DB.
	try {
		if (invoice.invoiceType === 'STRIPE' && invoice.stripeInvoiceId) {
			await voidStripeInvoice(invoice.stripeInvoiceId);
		}
	} catch (err) {
		logger.error('Error voiding Stripe invoice:', { error: err, timesheetId, userId });
	}

	return await db.transaction(async (tx) => {
		const [original] = await tx
			.select()
			.from(timeSheetTable)
			.where(eq(timeSheetTable.id, timesheetId));

		if (!original) {
			throw error(404, 'Timesheet not found');
		}

		const [voidedTimesheet] = await tx
			.update(timeSheetTable)
			.set({ status: 'VOID', wagesStatus: null, updatedAt: new Date() })
			.where(eq(timeSheetTable.id, timesheetId))
			.returning();

		// Detach the timesheet link only. The CALLER flips the invoice status to
		// void and notifies the client via voidInvoiceAndNotify (the single
		// notify-once gate), so we don't set status/voidedAt here — that keeps the
		// void email firing exactly once whether the void starts from an app action
		// or the Stripe invoice.voided webhook.
		await tx
			.update(invoiceTable)
			.set({ timesheetId: null, updatedAt: new Date() })
			.where(eq(invoiceTable.id, invoice.id!));

		// Disconnect the workdays (set timesheetId NULL) so the
		// processTimesheetCreation cron regenerates a fresh DRAFT for them on its
		// next run. The cron's status-filtered lookup ignores this VOID sheet, so
		// the released workdays form a brand-new DRAFT rather than re-joining it.
		await tx
			.update(workdayTable)
			.set({ timesheetId: null, updatedAt: new Date() })
			.where(eq(workdayTable.timesheetId, timesheetId));

		await writeActionHistory({
			table: 'TIMESHEETS',
			userId,
			action: 'UPDATE',
			entityId: timesheetId,
			beforeState: original,
			afterState: voidedTimesheet,
			metadata: {
				status: 'VOID',
				voidedInvoiceId: invoice.id,
				invoiceType: invoice.invoiceType,
				disconnectedWorkdays: true
			}
		});

		return { timesheet: voidedTimesheet, invoiceId: invoice.id };
	});
}

export async function rejectTimesheet(
	timesheetId: string,
	userId: string,
	discrepancyNote?: string
) {
	try {
		const [original] = await db
			.select()
			.from(timeSheetTable)
			.where(eq(timeSheetTable.id, timesheetId));

		const [result] = await db
			.update(timeSheetTable)
			.set({
				status: 'DISCREPANCY',
				updatedAt: new Date(),
				discrepancyNote: discrepancyNote || null
			})
			.where(eq(timeSheetTable.id, original.id))
			.returning();

		await writeActionHistory({
			table: 'TIMESHEETS',
			userId,
			action: 'UPDATE',
			entityId: timesheetId,
			beforeState: original,
			afterState: result,
			metadata: { status: 'DISCREPANCY' }
		});

		return result;
	} catch (err) {
		throw error(500, `Error rejecting timesheet: ${error}`);
	}
}

export async function approveTimesheet(timesheetId: string, userId: string | null) {
	try {
		const [original] = await db
			.select()
			.from(timeSheetTable)
			.where(eq(timeSheetTable.id, timesheetId));

		if (!original) {
			throw error(404, 'Timesheet not found');
		}

		// Update timesheet status to APPROVED. Record who approved and when —
		// approvedByUserId is null for the system/auto-approval path.
		const [result] = await db
			.update(timeSheetTable)
			.set({
				status: 'APPROVED',
				totalHoursBilled: original.totalHoursWorked,
				wagesStatus: 'WAGES_DUE',
				approvedAt: new Date(),
				approvedByUserId: userId,
				updatedAt: new Date()
			})
			.where(eq(timeSheetTable.id, timesheetId))
			.returning();

		await writeActionHistory({
			table: 'TIMESHEETS',
			userId,
			action: 'UPDATE',
			entityId: timesheetId,
			beforeState: original,
			afterState: result,
			metadata: { status: 'APPROVED' }
		});

		return result;
	} catch (err) {
		console.error('Error in approveTimesheet:', err);
		throw error(500, `Error approving timesheet: ${err}`);
	}
}

export async function updateTimesheetHours(
	timesheetId: string,
	updateData: {
		hoursRaw: Array<{
			date: string;
			workdayId?: string;
			recurrenceDayId?: string;
			hours: number;
			startTime: string;
			endTime: string;
		}>;
		totalHoursWorked: string;
		userId: string;
	}
) {
	const { hoursRaw, totalHoursWorked, userId } = updateData;

	// Get the current timesheet for audit trail
	const currentTimesheet = await getTimesheetById(timesheetId);
	if (!currentTimesheet) {
		throw new Error('Timesheet not found');
	}

	// Update the timesheet
	const [updatedTimesheet] = await db
		.update(timeSheetTable)
		.set({
			hoursRaw: hoursRaw,
			totalHoursWorked,
			updatedAt: new Date()
		})
		.where(eq(timeSheetTable.id, timesheetId))
		.returning();

	// Create audit history entry
	await db.insert(actionHistoryTable).values({
		id: crypto.randomUUID(),
		entityId: timesheetId,
		entityType: 'TIMESHEETS',
		userId,
		action: 'UPDATE',
		changes: {
			before: {
				hoursRaw: currentTimesheet.hoursRaw,
				totalHoursWorked: currentTimesheet.totalHoursWorked
			},
			after: {
				hoursRaw,
				totalHoursWorked
			}
		},
		metadata: {
			editType: 'HOURS_EDIT'
		},
		createdAt: new Date(),
		updatedAt: new Date()
	});

	return updatedTimesheet;
}

export const adminOverrideTimesheet = async (
	timesheetId: string,
	userId: string,
	values: UpdateTimeSheet
) => {
	try {
		const [original] = await db
			.select()
			.from(timeSheetTable)
			.where(eq(timeSheetTable.id, timesheetId));

		if (!original) {
			throw error(404, 'Timesheet not found');
		}

		const updatedValues: UpdateTimeSheet = {
			...values,
			totalHoursBilled: original.totalHoursWorked,
			status: 'APPROVED',
			wagesStatus: 'WAGES_DUE', // add this
			approvedAt: new Date(),
			approvedByUserId: userId,
			updatedAt: new Date()
		};

		const [result] = await db
			.update(timeSheetTable)
			.set(updatedValues)
			.where(eq(timeSheetTable.id, timesheetId))
			.returning();

		await writeActionHistory({
			table: 'TIMESHEETS',
			userId,
			action: 'UPDATE',
			entityId: timesheetId,
			beforeState: original,
			afterState: result,
			metadata: {
				status: 'APPROVED',
				overriddenBy: userId,
				overriddenFields: Object.keys(updatedValues).join(', ')
			}
		});

		return result;
	} catch (err) {
		console.error('Error in adminOverrideTimesheet:', err);
		throw error(500, `Error overriding timesheet: ${err}`);
	}
};

export async function getInvoiceByTimesheetId(
	timesheetId: string | undefined
): Promise<Invoice | null> {
	if (!timesheetId) throw error(400, 'Must provide timesheet ID');
	try {
		const [invoice] = await db
			.select()
			.from(invoiceTable)
			.where(eq(invoiceTable.timesheetId, timesheetId));

		return invoice || null;
	} catch (err) {
		console.error('Error fetching invoice by timesheet ID:', err);
		throw error(500, `Error fetching invoice by timesheet ID: ${err}`);
	}
}

export async function createInvoiceRecord(
	{
		clientId,
		timesheet,
		stripeInvoice,
		amountInDollars,
		requisitionId,
		sourceType
	}: {
		clientId: string;
		timesheet?: TimeSheetSelect;
		stripeInvoice: Stripe.Invoice;
		amountInDollars: string;
		// Allow tying a non-timesheet invoice (e.g. one-off charge for a
		// permanent-position requisition) to its requisition. Ignored for
		// timesheet-sourced invoices, which already derive this from the timesheet.
		requisitionId?: number;
		sourceType?: InvoiceSourceType;
	},
	userId: string | null
): Promise<Invoice> {
	try {
		if (timesheet) {
			// Create dates with consistent timezone handling
			const startDate = new Date(timesheet.weekBeginDate + 'T00:00:00Z');
			const endDate = new Date(startDate);
			endDate.setUTCDate(startDate.getUTCDate() + 6);

			const [invoice] = await db
				.insert(invoiceTable)
				.values({
					id: crypto.randomUUID(),
					clientId: timesheet.associatedClientId,
					invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
					timesheetId: timesheet.id,
					requisitionId: timesheet.requisitionId,
					candidateId: timesheet.associatedCandidateId,
					stripeInvoiceId: stripeInvoice.id,
					stripeCustomerId: stripeInvoice.customer as string,
					stripePdfUrl: stripeInvoice.invoice_pdf,
					stripeHostedUrl: stripeInvoice.hosted_invoice_url,
					status: 'open', // Maps to Stripe's 'open' status
					sourceType: 'timesheet',
					currency: 'usd',
					amountDue: amountInDollars,
					total: amountInDollars,
					subtotal: amountInDollars,
					amountRemaining: amountInDollars,
					stripeStatus: stripeInvoice.status,
					customerEmail: stripeInvoice.customer_email,
					customerName: stripeInvoice.customer_name, // You might want to include a more friendly name if available
					dueDate: stripeInvoice.due_date
						? new Date(stripeInvoice.due_date * 1000)
						: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Default to 1 day from now if no due date
					periodStart: startDate,
					periodEnd: endDate,
					description: stripeInvoice.description,
					lineItems: JSON.stringify(stripeInvoice.lines.data)
				})
				.returning();

			await writeActionHistory({
				table: 'INVOICES',
				userId,
				action: 'CREATE',
				entityId: invoice.id,
				afterState: invoice
			});

			return invoice;
		} else {
			const [invoice] = await db
				.insert(invoiceTable)
				.values({
					id: crypto.randomUUID(),
					clientId: clientId,
					invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
					requisitionId: requisitionId ?? null,
					stripeInvoiceId: stripeInvoice.id,
					stripeCustomerId: stripeInvoice.customer as string,
					stripePdfUrl: stripeInvoice.invoice_pdf,
					stripeHostedUrl: stripeInvoice.hosted_invoice_url,
					status: 'open', // Maps to Stripe's 'open' status
					sourceType: sourceType ?? 'manual',
					currency: 'usd',
					amountDue: amountInDollars,
					total: amountInDollars,
					subtotal: amountInDollars,
					amountRemaining: amountInDollars,
					stripeStatus: stripeInvoice.status,
					customerEmail: stripeInvoice.customer_email,
					customerName: stripeInvoice.customer_name, // You might want to include a more friendly name if available
					dueDate: stripeInvoice.due_date
						? new Date(stripeInvoice.due_date * 1000)
						: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Default to 1 day from now if no due date
					description: stripeInvoice.description,
					lineItems: JSON.stringify(stripeInvoice.lines.data)
				})
				.returning();

			await writeActionHistory({
				table: 'INVOICES',
				userId,
				action: 'CREATE',
				entityId: invoice.id,
				afterState: invoice
			});

			return invoice;
		}
	} catch (err) {
		console.error('Error creating invoice record:', error);
		throw error(500, `Error creating invoice record: ${error}`);
	}
}

export async function createPaperInvoiceRecord(
	{
		clientId,
		amountInDollars,
		dueDate,
		description,
		lineItems,
		customerEmail,
		customerName,
		timesheetId,
		requisitionId,
		candidateId,
		sourceType = 'manual'
	}: {
		clientId: string;
		amountInDollars: string;
		dueDate?: string;
		description?: string;
		lineItems: PaperInvoiceLineItem[];
		customerEmail?: string;
		customerName?: string;
		timesheetId?: string;
		requisitionId?: number;
		candidateId?: string;
		sourceType?: 'manual' | 'timesheet' | 'recurring' | 'other';
	},
	userId: string | null
): Promise<Invoice> {
	try {
		// Get next paper invoice number
		const [last] = await db
			.select({ invoiceNumber: invoiceTable.invoiceNumber })
			.from(invoiceTable)
			.where(like(invoiceTable.invoiceNumber, 'PAPER-%'))
			.orderBy(desc(invoiceTable.createdAt))
			.limit(1);

		let nextNumber = 1000;
		if (last?.invoiceNumber) {
			const parts = last.invoiceNumber.split('-');
			const lastNum = parseInt(parts[parts.length - 1]);
			if (!isNaN(lastNum)) nextNumber = lastNum + 1;
		}

		const invoiceNumber = `PAPER-${new Date().getFullYear()}-${String(nextNumber).padStart(4, '0')}`;

		const [invoice] = await db
			.insert(invoiceTable)
			.values({
				id: crypto.randomUUID(),
				clientId,
				invoiceNumber,
				status: 'open',
				sourceType, // now dynamic
				invoiceType: 'PAPER',
				currency: 'usd',
				amountDue: amountInDollars,
				total: amountInDollars,
				subtotal: amountInDollars,
				amountRemaining: amountInDollars,
				amountPaid: '0',
				customerEmail,
				customerName,
				timesheetId: timesheetId ?? null,
				requisitionId: requisitionId ?? null,
				candidateId: candidateId ?? null,
				dueDate: dueDate ? new Date(dueDate + 'T00:00:00') : new Date(Date.now()), // due upon receipt if no date is provided
				description,
				lineItems: JSON.stringify(lineItems)
			})
			.returning();

		await writeActionHistory({
			table: 'INVOICES',
			userId,
			action: 'CREATE',
			entityId: invoice.id,
			afterState: invoice
		});

		return invoice;
	} catch (err) {
		console.error('Error creating paper invoice record:', err);
		throw error(500, `Error creating paper invoice record: ${err}`);
	}
}

/**
 * Calculates the total amount to charge based on hours billed and rates
 * @param totalHoursBilled - Total hours billed (decimal string or number)
 * @param candidateRateBase - Base hourly rate (decimal string or number)
 * @param candidateRateOvertime - Optional overtime hourly rate (decimal string or number)
 * @returns Total amount in cents for Stripe (integer)
 */
// Weekly overtime kicks in past this many hours. Overtime is always billed at
// 1.5× the base rate, and the admin fee never applies to the overtime portion.
export const STANDARD_HOURS_THRESHOLD = 40;
export const OVERTIME_MULTIPLIER = 1.5;

export type HoursBreakdown = {
	regularHours: number;
	overtimeHours: number;
	regularCents: number;
	overtimeCents: number;
	billableCents: number;
};

/**
 * Single source of truth for the weekly 40h overtime split. Hours up to 40 bill
 * at `baseRate`; hours beyond 40 bill at `baseRate × 1.5`. `baseRate` is in
 * dollars. Returns each portion in cents plus the combined `billableCents`
 * (which equals what `convertToStripeAmount` returns).
 *
 * `priorWeekHours` is the number of hours already billed for this candidate's
 * week on OTHER (approved) timesheets. Overtime is a per-WEEK concept, so when a
 * week is split across parallel timesheets the regular-hour allotment must
 * continue rather than restart: the 40h threshold is reduced by `priorWeekHours`.
 * Defaults to 0 (the normal single-timesheet case — fully back-compatible).
 */
export function computeHoursBreakdown(
	totalHoursWorked: string | number,
	rateOfPayBase: string | number | null,
	priorWeekHours = 0
): HoursBreakdown {
	if (!rateOfPayBase) throw new Error('Base rate is required');

	// Round hours to 2 decimals (hundredth of an hour). total_hours_worked is a
	// float sum of per-day hours and can carry float artifacts (e.g.
	// 37.51666666666667); passed verbatim as Stripe's `quantity_decimal` that
	// exceeds Stripe's precision limit and rejects the invoice-item create,
	// which reverts timesheet approval. Rounding here (the single source of
	// truth) keeps the quantity Stripe-safe and the line total on exact cents.
	const round2 = (n: number) => Math.round(n * 100) / 100;
	const hours = round2(parseFloat(String(totalHoursWorked)));
	const baseRate = parseFloat(String(rateOfPayBase));

	if (isNaN(hours) || hours < 0) {
		throw new Error('Invalid totalHoursWorked: must be a valid positive number');
	}
	if (isNaN(baseRate) || baseRate < 0) {
		throw new Error('Invalid rateOfPayBase: must be a valid positive number');
	}
	if (isNaN(priorWeekHours) || priorWeekHours < 0) {
		throw new Error('Invalid priorWeekHours: must be a valid non-negative number');
	}

	// Regular-hour allotment left for the week after hours already billed on
	// sibling timesheets. Once the week has hit 40h, everything here is overtime.
	const remainingRegular = Math.max(0, STANDARD_HOURS_THRESHOLD - priorWeekHours);
	const regularHours = round2(Math.min(hours, remainingRegular));
	const overtimeHours = round2(Math.max(0, hours - regularHours));

	const regularCents = Math.round(regularHours * baseRate * 100);
	const overtimeCents = Math.round(overtimeHours * baseRate * OVERTIME_MULTIPLIER * 100);

	return {
		regularHours,
		overtimeHours,
		regularCents,
		overtimeCents,
		billableCents: regularCents + overtimeCents
	};
}

/**
 * Thin wrapper kept for existing callers: returns the combined billable amount
 * in cents (regular + overtime). The optional overtime-rate argument is ignored
 * — overtime is always 1.5× base via {@link computeHoursBreakdown}.
 */
export function convertToStripeAmount(
	totalHoursWorked: string | number,
	rateOfPayBase: string | number | null,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_rateOfPayWithOvertime?: string | number | null
): number {
	return computeHoursBreakdown(totalHoursWorked, rateOfPayBase).billableCents;
}

/**
 * Hours already billed for this candidate's week on OTHER timesheets — i.e. the
 * sum of `totalHoursBilled` across APPROVED timesheets for the same
 * candidate+requisition+week, excluding the one being approved. Feeds
 * `computeHoursBreakdown`'s `priorWeekHours` so overtime continues correctly when
 * a week is split across parallel timesheets. Only APPROVED counts as "billed";
 * VOID/REJECTED don't, so a void→regenerated sheet starts fresh.
 */
export async function getApprovedBilledHoursForWeek(args: {
	candidateId: string;
	requisitionId: number;
	weekBeginDate: string;
	excludeTimesheetId: string;
	// Optional: only count siblings created before this timestamp. Used for the
	// DISPLAY of an already-approved timesheet so its regular/overtime split stays
	// stable (it reflects the sheets that preceded it, not ones approved later).
	// Omit it for the billing path, where "all currently-approved siblings" is
	// what yields the correct weekly total at approval time.
	createdBefore?: Date;
}): Promise<number> {
	const conditions = [
		eq(timeSheetTable.associatedCandidateId, args.candidateId),
		eq(timeSheetTable.requisitionId, args.requisitionId),
		eq(timeSheetTable.weekBeginDate, args.weekBeginDate),
		eq(timeSheetTable.status, 'APPROVED'),
		ne(timeSheetTable.id, args.excludeTimesheetId)
	];
	if (args.createdBefore) {
		conditions.push(lt(timeSheetTable.createdAt, args.createdBefore));
	}

	const rows = await db
		.select({ billed: timeSheetTable.totalHoursBilled })
		.from(timeSheetTable)
		.where(and(...conditions));

	return rows.reduce((sum, r) => sum + (parseFloat(String(r.billed ?? 0)) || 0), 0);
}

/**
 * Monday (in the requisition's timezone) of the week containing `dayStart`,
 * formatted YYYY-MM-DD. Mirrors the canonical calc in the
 * processTimesheetCreation cron so every workday-linking site agrees on the
 * week boundary.
 */
export function computeWeekBeginDate(
	dayStart: Date,
	referenceTimezone: string | null | undefined
): string {
	const tz = referenceTimezone || 'America/New_York';
	const dayStartInTz = toZonedTime(dayStart, tz);
	const dayOfWeek = dayStartInTz.getDay(); // 0=Sun, 1=Mon ... 6=Sat
	const diffToMonday = (dayOfWeek + 6) % 7;
	const monday = new Date(dayStartInTz);
	monday.setDate(dayStartInTz.getDate() - diffToMonday);
	return monday.toISOString().split('T')[0];
}

// Timesheet statuses that are still "open" — a workday may attach to one of
// these, and the cron/proactive linker should reuse it rather than spawn a new
// timesheet. Terminal statuses (APPROVED, VOID, REJECTED) are excluded so a
// disconnected/late workday forms a fresh DRAFT instead of re-joining them.
export const OPEN_TIMESHEET_STATUSES = ['DRAFT', 'PENDING', 'DISCREPANCY'] as const;

export async function getCompanyByRequisitionIdAdmin(id: number) {
	try {
		const [result] = await db
			.select({ company: { ...clientCompanyTable } })
			.from(requisitionTable)
			.where(eq(requisitionTable.id, id))
			.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id));

		return result?.company || null;
	} catch (err) {
		throw error(500, `Error fetching company: ${error}`);
	}
}

// ── Timesheet expenses ──────────────────────────────────────────────

export async function listTimesheetExpenses(
	timesheetId: string
): Promise<TimesheetExpenseSelect[]> {
	return db
		.select()
		.from(timesheetExpenseTable)
		.where(eq(timesheetExpenseTable.timesheetId, timesheetId))
		.orderBy(asc(timesheetExpenseTable.createdAt));
}

export async function getTimesheetExpenseById(
	expenseId: string
): Promise<TimesheetExpenseSelect | null> {
	const [row] = await db
		.select()
		.from(timesheetExpenseTable)
		.where(eq(timesheetExpenseTable.id, expenseId))
		.limit(1);
	return row ?? null;
}

export async function createTimesheetExpense(
	{
		timesheetId,
		candidateId,
		description,
		amountCents,
		createdByUserId
	}: {
		timesheetId: string;
		candidateId: string;
		description: string;
		amountCents: number;
		createdByUserId: string;
	},
	actorUserId: string
): Promise<TimesheetExpenseSelect> {
	if (amountCents <= 0) throw error(400, 'Expense amount must be greater than zero');
	if (!description?.trim()) throw error(400, 'Expense description is required');

	const now = new Date();
	const [row] = await db
		.insert(timesheetExpenseTable)
		.values({
			id: crypto.randomUUID(),
			createdAt: now,
			updatedAt: now,
			timesheetId,
			candidateId,
			description: description.trim(),
			amountCents,
			status: 'PENDING',
			createdByUserId
		})
		.returning();

	await writeActionHistory({
		table: 'TIMESHEETS',
		action: 'CREATE',
		userId: actorUserId,
		entityId: row.id,
		afterState: row,
		metadata: { kind: 'TIMESHEET_EXPENSE', timesheetId }
	});

	return row;
}

export async function updateTimesheetExpense(
	expenseId: string,
	patch: { description?: string; amountCents?: number },
	actorUserId: string
): Promise<TimesheetExpenseSelect> {
	const before = await getTimesheetExpenseById(expenseId);
	if (!before) throw error(404, 'Expense not found');
	if (before.status !== 'PENDING') {
		throw error(400, 'Only pending expenses can be edited');
	}
	if (patch.amountCents !== undefined && patch.amountCents <= 0) {
		throw error(400, 'Expense amount must be greater than zero');
	}
	if (patch.description !== undefined && !patch.description.trim()) {
		throw error(400, 'Expense description is required');
	}

	const [row] = await db
		.update(timesheetExpenseTable)
		.set({
			description: patch.description?.trim() ?? before.description,
			amountCents: patch.amountCents ?? before.amountCents,
			updatedAt: new Date()
		})
		.where(eq(timesheetExpenseTable.id, expenseId))
		.returning();

	await writeActionHistory({
		table: 'TIMESHEETS',
		action: 'UPDATE',
		userId: actorUserId,
		entityId: expenseId,
		beforeState: before,
		afterState: row,
		metadata: { kind: 'TIMESHEET_EXPENSE', timesheetId: before.timesheetId }
	});

	return row;
}

export async function deleteTimesheetExpense(
	expenseId: string,
	actorUserId: string
): Promise<void> {
	const before = await getTimesheetExpenseById(expenseId);
	if (!before) throw error(404, 'Expense not found');
	if (before.status !== 'PENDING') {
		throw error(400, 'Only pending expenses can be deleted');
	}

	await db.delete(timesheetExpenseTable).where(eq(timesheetExpenseTable.id, expenseId));

	await writeActionHistory({
		table: 'TIMESHEETS',
		action: 'DELETE',
		userId: actorUserId,
		entityId: expenseId,
		beforeState: before,
		metadata: { kind: 'TIMESHEET_EXPENSE', timesheetId: before.timesheetId }
	});
}

export async function approveTimesheetExpense(
	expenseId: string,
	actorUserId: string
): Promise<TimesheetExpenseSelect> {
	const before = await getTimesheetExpenseById(expenseId);
	if (!before) throw error(404, 'Expense not found');
	if (before.status === 'APPROVED') return before;

	const [row] = await db
		.update(timesheetExpenseTable)
		.set({
			status: 'APPROVED',
			approvedByUserId: actorUserId,
			approvedAt: new Date(),
			rejectionReason: null,
			updatedAt: new Date()
		})
		.where(eq(timesheetExpenseTable.id, expenseId))
		.returning();

	await writeActionHistory({
		table: 'TIMESHEETS',
		action: 'UPDATE',
		userId: actorUserId,
		entityId: expenseId,
		beforeState: before,
		afterState: row,
		metadata: { kind: 'TIMESHEET_EXPENSE_APPROVAL', timesheetId: before.timesheetId }
	});

	return row;
}

export async function rejectTimesheetExpense(
	expenseId: string,
	actorUserId: string,
	reason: string
): Promise<TimesheetExpenseSelect> {
	const before = await getTimesheetExpenseById(expenseId);
	if (!before) throw error(404, 'Expense not found');
	if (!reason?.trim()) throw error(400, 'Rejection reason is required');

	const [row] = await db
		.update(timesheetExpenseTable)
		.set({
			status: 'REJECTED',
			approvedByUserId: actorUserId,
			approvedAt: new Date(),
			rejectionReason: reason.trim(),
			updatedAt: new Date()
		})
		.where(eq(timesheetExpenseTable.id, expenseId))
		.returning();

	await writeActionHistory({
		table: 'TIMESHEETS',
		action: 'UPDATE',
		userId: actorUserId,
		entityId: expenseId,
		beforeState: before,
		afterState: row,
		metadata: { kind: 'TIMESHEET_EXPENSE_REJECTION', timesheetId: before.timesheetId }
	});

	return row;
}
