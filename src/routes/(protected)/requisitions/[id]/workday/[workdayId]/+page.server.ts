import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import {
	getClientCompanyByClientId,
	getClientIdByCompanyId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getLocationByIdForCompany
} from '$lib/server/database/queries/clients';
import {
	getRecurrenceDayDetails,
	getRequisitionDetailsById,
	getWorkdayDetails
} from '$lib/server/database/queries/requisitions';
import { USER_ROLES } from '$lib/config/constants';
import { getClientProfileByIdAdmin } from '$lib/server/database/queries/admin';
import { getQualifiedProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { and, eq } from 'drizzle-orm';
import { setFlash } from 'sveltekit-flash-message/server';
import { timeSheetTable as timesheetTable } from '$lib/server/database/schemas/requisition';

export async function load({ locals, params }: RequestEvent) {
	const user = locals.user;
	if (!user) {
		return redirect(302, '/auth/sign-in');
	}

	const recurrenceDayId = params.workdayId;
	const requisitionId = Number(params.id);

	if (user.role === USER_ROLES.SUPERADMIN) {
		const requisition = await getRequisitionDetailsById(requisitionId);
		const client = await getClientProfileByIdAdmin(requisition.requisition.company.clientId);
		const company = await getClientCompanyByClientId(client.id);
		const recurrenceDay = await getRecurrenceDayDetails(recurrenceDayId, company.id);
		const workday = await getWorkdayDetails(recurrenceDayId, company.id);
		const location = await getLocationByIdForCompany(
			requisition.requisition.locationId,
			company.id
		);
		console.log({ requisition, recurrenceDay, workday, client, company, location });

		const qualifiedProfessionals = await getQualifiedProfessionalsForRequisition(
			requisition.requisition,
			location
		);

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition,
			qualifiedProfessionals
		};
	}

	if (user.role === 'CLIENT') {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		const company = await getClientCompanyByClientId(client.id);
		const recurrenceDay = await getRecurrenceDayDetails(recurrenceDayId, company.id);
		const workday = await getWorkdayDetails(recurrenceDayId, company.id);
		const requisition = await getRequisitionDetailsById(requisitionId);

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition,
			location
		};
	}

	if (user.role === 'CLIENT_STAFF') {
		const client = await getClientProfileByStaffUserId(user.id);
		const company = await getClientCompanyByClientId(client?.id);
		const recurrenceDay = await getRecurrenceDayDetails(recurrenceDayId, company.id);
		const workday = await getWorkdayDetails(recurrenceDayId, company.id);
		const requisition = await getRequisitionDetailsById(requisitionId);

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition
		};
	}
}

export const actions = {
	assignCandidate: async (event: RequestEvent) => {
		const { request, locals, params } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		// Only allow SUPERADMIN, CLIENT, or CLIENT_STAFF to assign
		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized to assign candidates' });
		}

		const formData = await request.formData();
		const candidateId = formData.get('candidateId') as string;
		const recurrenceDayId = formData.get('recurrenceDayId') as string;
		const requisitionId = Number(params.id);

		if (!candidateId || !recurrenceDayId) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			// Use transaction to ensure all operations succeed together
			await db.transaction(async (tx) => {
				// Check if workday already exists for this recurrence day
				const existingWorkday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1);

				if (existingWorkday.length > 0) {
					throw new Error('Workday already assigned');
				}

				// Get recurrence day details to get the date
				const recurrenceDay = await tx
					.select()
					.from(recurrenceDayTable)
					.where(eq(recurrenceDayTable.id, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!recurrenceDay) {
					throw new Error('Recurrence day not found');
				}

				// Get requisition details for client ID
				const requisition = await tx
					.select()
					.from(requisitionTable)
					.where(eq(requisitionTable.id, requisitionId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!requisition) {
					throw new Error('Requisition not found');
				}

				// Get client ID from company
				const clientId = await getClientIdByCompanyId(requisition.companyId);

				// Create the workday
				const workdayId = crypto.randomUUID();
				await tx.insert(workdayTable).values({
					id: workdayId,
					candidateId: candidateId,
					requisitionId: requisitionId,
					recurrenceDayId: recurrenceDayId,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				// Calculate week start date (Sunday of the week containing this recurrence day)
				const weekStart = new Date(recurrenceDay.date);
				const dayOfWeek = weekStart.getDay();
				weekStart.setDate(weekStart.getDate() - dayOfWeek);
				const weekStartStr = weekStart.toISOString().split('T')[0];

				// Check if a timesheet already exists for this candidate, week, and requisition
				const existingTimesheet = await tx
					.select()
					.from(timesheetTable)
					.where(
						and(
							eq(timesheetTable.associatedCandidateId, candidateId),
							eq(timesheetTable.weekBeginDate, weekStartStr),
							eq(timesheetTable.requisitionId, requisitionId)
						)
					)
					.limit(1);

				// Create timesheet only if one doesn't exist for this week
				if (existingTimesheet.length === 0) {
					const timesheetId = crypto.randomUUID();
					await tx.insert(timesheetTable).values({
						id: timesheetId,
						createdAt: new Date(),
						updatedAt: new Date(),
						workdayId: workdayId,
						associatedCandidateId: candidateId,
						associatedClientId: clientId,
						requisitionId: requisitionId,
						weekBeginDate: weekStartStr,
						totalHoursWorked: '0',
						totalHoursBilled: '0',
						hoursRaw: [],
						status: 'PENDING',
						validated: false,
						awaitingClientSignature: true,
						candidateRateBase: null,
						candidateRateOvertime: null
					});

					console.log(`Created new timesheet ${timesheetId} for week starting ${weekStartStr}`);
				} else {
					console.log(`Timesheet already exists for week starting ${weekStartStr}`);
				}

				// Update recurrence day status to FILLED
				await tx
					.update(recurrenceDayTable)
					.set({
						status: 'FILLED',
						updatedAt: new Date()
					})
					.where(eq(recurrenceDayTable.id, recurrenceDayId));
			});

			setFlash(
				{
					type: 'success',
					message: 'Professional successfully assigned to workday'
				},
				event
			);

			return { success: true };
		} catch (error) {
			console.error('Error assigning candidate:', error);

			const errorMessage = error instanceof Error ? error.message : 'Failed to assign candidate';

			setFlash(
				{
					type: 'error',
					message:
						errorMessage === 'Workday already assigned'
							? 'This workday already has a candidate assigned'
							: 'Failed to assign professional'
				},
				event
			);

			return fail(500, { error: errorMessage });
		}
	},
	blacklistCandidate: async (request: RequestEvent) => {}
};
