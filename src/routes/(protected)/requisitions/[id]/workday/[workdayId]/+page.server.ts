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
	editRecurrenceDay,
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
	workdayTable,
	timeSheetTable as timesheetTable
} from '$lib/server/database/schemas/requisition';
import { and, eq } from 'drizzle-orm';
import { setFlash } from 'sveltekit-flash-message/server';
import { editRecurrenceDaySchema } from '$lib/config/zod-schemas';
import { superValidate, message, setError } from 'sveltekit-superforms/server';
import { convertRecurrenceDayToUTC } from '$lib/_helpers/UTCTimezoneUtils';
import { z } from 'zod';

const adjustedHourlyRateSchema = z.object({
	workdayId: z.string().min(1),
	adjustedHourlyRate: z.coerce.number().int().min(0).nullable()
});

export async function load(event: RequestEvent) {
	const user = event.locals.user;
	if (!user) {
		return redirect(302, '/auth/sign-in');
	}

	const recurrenceDayId = event.params.workdayId;
	const requisitionId = Number(event.params.id);
	const editWorkdayScheduleForm = await superValidate(event, editRecurrenceDaySchema);
	const adjustedRateForm = await superValidate(event, adjustedHourlyRateSchema);

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

		const qualifiedProfessionals = await getQualifiedProfessionalsForRequisition(
			requisition.requisition,
			location
		);

		editWorkdayScheduleForm.data = {
			...editWorkdayScheduleForm.data,
			date: recurrenceDay.recurrenceDay.date,
			startTime: recurrenceDay.recurrenceDay.dayStart.toString(),
			endTime: recurrenceDay.recurrenceDay.dayEnd.toString(),
			lunchStartTime: recurrenceDay.recurrenceDay.lunchStart?.toString() ?? undefined,
			lunchEndTime: recurrenceDay.recurrenceDay.lunchEnd?.toString() ?? undefined
		};

		if (workday?.workday) {
			adjustedRateForm.data = {
				workdayId: workday.workday.id,
				adjustedHourlyRate: workday.workday.adjustedHourlyRate ?? null
			};
		}

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition,
			location,
			qualifiedProfessionals,
			editWorkdayScheduleForm,
			adjustedRateForm
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
		const location = await getLocationByIdForCompany(
			requisition.requisition.locationId,
			company.id
		);
		const qualifiedProfessionals = await getQualifiedProfessionalsForRequisition(
			requisition.requisition,
			location
		);

		editWorkdayScheduleForm.data = {
			...editWorkdayScheduleForm.data,
			date: recurrenceDay.recurrenceDay.date,
			startTime: recurrenceDay.recurrenceDay.dayStart.toString(),
			endTime: recurrenceDay.recurrenceDay.dayEnd.toString(),
			lunchStartTime: recurrenceDay.recurrenceDay.lunchStart?.toString() ?? undefined,
			lunchEndTime: recurrenceDay.recurrenceDay.lunchEnd?.toString() ?? undefined
		};

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition,
			location,
			qualifiedProfessionals,
			editWorkdayScheduleForm,
			adjustedRateForm
		};
	}

	if (user.role === 'CLIENT_STAFF') {
		const client = await getClientProfileByStaffUserId(user.id);
		const company = await getClientCompanyByClientId(client?.id);
		const recurrenceDay = await getRecurrenceDayDetails(recurrenceDayId, company.id);
		const workday = await getWorkdayDetails(recurrenceDayId, company.id);
		const requisition = await getRequisitionDetailsById(requisitionId);
		const location = await getLocationByIdForCompany(
			requisition.requisition.locationId,
			company.id
		);
		const qualifiedProfessionals = await getQualifiedProfessionalsForRequisition(
			requisition.requisition,
			location
		);

		editWorkdayScheduleForm.data = {
			...editWorkdayScheduleForm.data,
			date: recurrenceDay.recurrenceDay.date,
			startTime: recurrenceDay.recurrenceDay.dayStart.toString(),
			endTime: recurrenceDay.recurrenceDay.dayEnd.toString(),
			lunchStartTime: recurrenceDay.recurrenceDay.lunchStart?.toString() ?? undefined,
			lunchEndTime: recurrenceDay.recurrenceDay.lunchEnd?.toString() ?? undefined
		};

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition,
			location,
			qualifiedProfessionals,
			editWorkdayScheduleForm,
			adjustedRateForm
		};
	}
}

export const actions = {
	editRecurrenceDay: async (event: RequestEvent) => {
		const { locals, params } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized' });
		}

		const form = await superValidate(event, editRecurrenceDaySchema);

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const recurrenceDayId = params.workdayId;
			const requisitionId = Number(params.id);
			const { date, startTime, endTime, lunchStartTime, lunchEndTime } = form.data;

			const requisition = await getRequisitionDetailsById(requisitionId);
			const timezone = requisition.requisition.referenceTimezone;

			// Re-use the same UTC conversion helper used elsewhere in the app
			const utcDay = convertRecurrenceDayToUTC(
				{
					date,
					dayStartTime: startTime,
					dayEndTime: endTime,
					lunchStartTime: lunchStartTime ?? '',
					lunchEndTime: lunchEndTime ?? '',
					requisitionId
				},
				timezone
			);

			const values = {
				updatedAt: new Date(),
				date: utcDay.date,
				dayStart: utcDay.dayStart,
				dayEnd: utcDay.dayEnd,
				lunchStart: utcDay.lunchStart,
				lunchEnd: utcDay.lunchEnd
			};

			await editRecurrenceDay(recurrenceDayId, values, user.id);

			setFlash({ type: 'success', message: 'Schedule updated successfully' }, event);
			return message(form, 'Schedule updated');
		} catch (error) {
			console.error('Error editing recurrence day:', error);
			setFlash({ type: 'error', message: 'Failed to update schedule' }, event);
			return setError(form, 'Something went wrong');
		}
	},

	assignCandidate: async (event: RequestEvent) => {
		const { request, locals, params } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

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
			await db.transaction(async (tx) => {
				const existingWorkday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1);

				if (existingWorkday.length > 0) {
					throw new Error('Workday already assigned');
				}

				const recurrenceDay = await tx
					.select()
					.from(recurrenceDayTable)
					.where(eq(recurrenceDayTable.id, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!recurrenceDay) throw new Error('Recurrence day not found');

				const requisition = await tx
					.select()
					.from(requisitionTable)
					.where(eq(requisitionTable.id, requisitionId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!requisition) throw new Error('Requisition not found');

				const clientId = await getClientIdByCompanyId(requisition.companyId);

				const workdayId = crypto.randomUUID();
				await tx.insert(workdayTable).values({
					id: workdayId,
					candidateId,
					requisitionId,
					recurrenceDayId,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				const recurrenceDate = new Date(recurrenceDay.date);
				const dayOfWeek = recurrenceDate.getUTCDay();
				const diffToMonday = (dayOfWeek + 6) % 7;
				const weekStartDate = new Date(recurrenceDate);
				weekStartDate.setUTCDate(recurrenceDate.getUTCDate() - diffToMonday);
				const weekStartStr = weekStartDate.toISOString().split('T')[0];

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

				if (existingTimesheet.length === 0) {
					const timesheetId = crypto.randomUUID();
					await tx.insert(timesheetTable).values({
						id: timesheetId,
						createdAt: new Date(),
						updatedAt: new Date(),
						workdayId,
						associatedCandidateId: candidateId,
						associatedClientId: clientId,
						requisitionId,
						weekBeginDate: weekStartStr,
						totalHoursWorked: '0',
						totalHoursBilled: '0',
						hoursRaw: [],
						status: 'PENDING',
						validated: false,
						awaitingClientSignature: true
					});
				}

				await tx
					.update(recurrenceDayTable)
					.set({ status: 'FILLED', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));
			});

			setFlash(
				{ type: 'success', message: 'Professional successfully assigned to workday' },
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

	unassignCandidate: async (event: RequestEvent) => {
		const { request, locals } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const recurrenceDayId = formData.get('recurrenceDayId') as string;

		if (!recurrenceDayId) {
			return fail(400, { error: 'Missing recurrenceDayId' });
		}

		try {
			await db.transaction(async (tx) => {
				// Find the workday for this recurrence day
				const workday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!workday) throw new Error('No workday found for this recurrence day');

				// Delete associated timesheets
				await tx.delete(timesheetTable).where(eq(timesheetTable.workdayId, workday.id));

				// Delete the workday
				await tx.delete(workdayTable).where(eq(workdayTable.id, workday.id));

				// Reset recurrence day back to OPEN
				await tx
					.update(recurrenceDayTable)
					.set({ status: 'OPEN', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));
			});

			setFlash({ type: 'success', message: 'Professional successfully unassigned' }, event);
			return { success: true };
		} catch (error) {
			console.error('Error unassigning candidate:', error);
			setFlash({ type: 'error', message: 'Failed to unassign professional' }, event);
			return fail(500, { error: error instanceof Error ? error.message : 'Unknown error' });
		}
	},

	reassignRecurrenceDay: async (event: RequestEvent) => {
		const { request, locals, params } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized to reassign candidates' });
		}

		const formData = await request.formData();
		const newCandidateId = formData.get('candidateId') as string;
		const recurrenceDayId = formData.get('recurrenceDayId') as string;
		const requisitionId = Number(params.id);

		if (!newCandidateId || !recurrenceDayId) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			await db.transaction(async (tx) => {
				// Find existing workday
				const existingWorkday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!existingWorkday) throw new Error('No workday found to reassign');

				// Delete old timesheets tied to this workday
				await tx.delete(timesheetTable).where(eq(timesheetTable.workdayId, existingWorkday.id));

				// Delete old workday
				await tx.delete(workdayTable).where(eq(workdayTable.id, existingWorkday.id));

				// Get recurrence day for date info
				const recurrenceDay = await tx
					.select()
					.from(recurrenceDayTable)
					.where(eq(recurrenceDayTable.id, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!recurrenceDay) throw new Error('Recurrence day not found');

				// Get requisition for client ID
				const requisition = await tx
					.select()
					.from(requisitionTable)
					.where(eq(requisitionTable.id, requisitionId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!requisition) throw new Error('Requisition not found');

				const clientId = await getClientIdByCompanyId(requisition.companyId);

				// Create new workday for the new candidate
				const newWorkdayId = crypto.randomUUID();
				await tx.insert(workdayTable).values({
					id: newWorkdayId,
					candidateId: newCandidateId,
					requisitionId,
					recurrenceDayId,
					adjustedHourlyRate: null, // wipe rate on reassign
					createdAt: new Date(),
					updatedAt: new Date()
				});

				// Calculate week start date
				const recurrenceDate = new Date(recurrenceDay.date);
				const dayOfWeek = recurrenceDate.getUTCDay();
				const diffToMonday = (dayOfWeek + 6) % 7;
				const weekStartDate = new Date(recurrenceDate);
				weekStartDate.setUTCDate(recurrenceDate.getUTCDate() - diffToMonday);
				const weekStartStr = weekStartDate.toISOString().split('T')[0];

				// Check if a timesheet already exists for new candidate this week
				const existingTimesheet = await tx
					.select()
					.from(timesheetTable)
					.where(
						and(
							eq(timesheetTable.associatedCandidateId, newCandidateId),
							eq(timesheetTable.weekBeginDate, weekStartStr),
							eq(timesheetTable.requisitionId, requisitionId)
						)
					)
					.limit(1);

				if (existingTimesheet.length === 0) {
					const timesheetId = crypto.randomUUID();
					await tx.insert(timesheetTable).values({
						id: timesheetId,
						createdAt: new Date(),
						updatedAt: new Date(),
						workdayId: newWorkdayId,
						associatedCandidateId: newCandidateId,
						associatedClientId: clientId,
						requisitionId,
						weekBeginDate: weekStartStr,
						totalHoursWorked: '0',
						totalHoursBilled: '0',
						hoursRaw: [],
						status: 'PENDING',
						validated: false,
						awaitingClientSignature: true
					});
				}

				// Keep recurrence day as FILLED since we still have someone assigned
				await tx
					.update(recurrenceDayTable)
					.set({ status: 'FILLED', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));
			});

			setFlash({ type: 'success', message: 'Professional successfully reassigned' }, event);
			return { success: true };
		} catch (error) {
			console.error('Error reassigning candidate:', error);
			setFlash({ type: 'error', message: 'Failed to reassign professional' }, event);
			return fail(500, { error: error instanceof Error ? error.message : 'Unknown error' });
		}
	},

	cancelWorkday: async (event: RequestEvent) => {
		const { request, locals } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized' });
		}

		try {
			const formData = await request.formData();
			const recurrenceDayId = formData.get('recurrenceDayId') as string;

			if (!recurrenceDayId) {
				return fail(400, { error: 'Missing required fields' });
			}

			await db.transaction(async (tx) => {
				await tx
					.update(recurrenceDayTable)
					.set({ status: 'CANCELED', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));

				await tx.delete(workdayTable).where(eq(workdayTable.recurrenceDayId, recurrenceDayId));
			});

			setFlash({ type: 'success', message: 'Workday successfully cancelled' }, event);
			return { success: true };
		} catch (error) {
			console.error('Error cancelling workday:', error);
			setFlash({ type: 'error', message: 'Failed to cancel workday' }, event);
			return fail(500, { error: error instanceof Error ? error.message : 'Unknown error' });
		}
	},

	setAdjustedHourlyRate: async (event: RequestEvent) => {
		const { locals } = event;
		const user = locals.user;

		if (!user) {
			return fail(403, { error: 'Not authenticated' });
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { error: 'Only admins can adjust the hourly rate' });
		}

		const form = await superValidate(event, adjustedHourlyRateSchema);

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const { workdayId, adjustedHourlyRate } = form.data;

			await db
				.update(workdayTable)
				.set({
					adjustedHourlyRate: adjustedHourlyRate,
					updatedAt: new Date()
				})
				.where(eq(workdayTable.id, workdayId));

			setFlash({ type: 'success', message: 'Hourly rate updated successfully' }, event);
			return message(form, 'Rate updated');
		} catch (error) {
			console.error('Error updating adjusted hourly rate:', error);
			setFlash({ type: 'error', message: 'Failed to update hourly rate' }, event);
			return setError(form, 'Something went wrong');
		}
	},

	blacklistCandidate: async (_event: RequestEvent) => {}
};
