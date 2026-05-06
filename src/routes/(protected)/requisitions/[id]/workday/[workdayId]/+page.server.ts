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
import {
	notifyWorkdayClaimed,
	notifyWorkdayReposted,
	notifyWorkdayDeleted
} from '$lib/server/notifications/transactional';

const adjustedHourlyRateSchema = z.object({
	timesheetId: z.string().min(1),
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

		return {
			user,
			recurrenceDay,
			workday,
			client,
			company,
			requisition,
			location,
			qualifiedProfessionals,
			editWorkdayScheduleForm
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
			editWorkdayScheduleForm
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
			editWorkdayScheduleForm
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
			const newWorkdayId = await db.transaction(async (tx) => {
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

				const workdayId = crypto.randomUUID();
				await tx.insert(workdayTable).values({
					id: workdayId,
					candidateId,
					requisitionId,
					recurrenceDayId,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				await tx
					.update(recurrenceDayTable)
					.set({ status: 'FILLED', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));

				return workdayId;
			});

			// Same notification as a candidate self-claim — client gets the
			// "workday filled" email + SMS. Fires after tx commits so a notify
			// failure doesn't roll back the assignment.
			await notifyWorkdayClaimed(newWorkdayId);

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
			const snapshot = await db.transaction(async (tx) => {
				// Find the workday for this recurrence day
				const workday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!workday) throw new Error('No workday found for this recurrence day');

				const timesheetId = workday.timesheetId;

				// Snapshot the recurrence day for the candidate-side notification
				// (the row stays in place but the workday link is gone afterwards).
				const recurrenceDay = await tx
					.select()
					.from(recurrenceDayTable)
					.where(eq(recurrenceDayTable.id, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				await tx.delete(workdayTable).where(eq(workdayTable.id, workday.id));

				if (timesheetId) {
					const remaining = await tx
						.select()
						.from(workdayTable)
						.where(eq(workdayTable.timesheetId, timesheetId))
						.limit(1);
					if (remaining.length === 0) {
						await tx.delete(timesheetTable).where(eq(timesheetTable.id, timesheetId));
					}
				}

				// Reset recurrence day back to OPEN
				await tx
					.update(recurrenceDayTable)
					.set({ status: 'OPEN', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));

				return {
					candidateId: workday.candidateId,
					requisitionId: workday.requisitionId,
					recurrenceDayId,
					recurrenceDay: recurrenceDay ?? null
				};
			});

			// Two notifications fan out after the tx commits:
			// 1. Client gets the "workday reposted" message (same as if the
			//    candidate had cancelled themselves).
			// 2. The candidate gets the "your workday was cancelled" email so
			//    they aren't blindsided when the day disappears from their view.
			await notifyWorkdayReposted({
				candidateId: snapshot.candidateId,
				requisitionId: snapshot.requisitionId,
				recurrenceDayId: snapshot.recurrenceDayId
			});
			if (snapshot.recurrenceDay) {
				await notifyWorkdayDeleted({
					candidateId: snapshot.candidateId,
					requisitionId: snapshot.requisitionId,
					recurrenceDay: {
						date: snapshot.recurrenceDay.date,
						dayStart: snapshot.recurrenceDay.dayStart,
						dayEnd: snapshot.recurrenceDay.dayEnd
					}
				});
			}

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
			const reassignSnapshot = await db.transaction(async (tx) => {
				// Find existing workday
				const existingWorkday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				if (!existingWorkday) throw new Error('No workday found to reassign');

				const oldCandidateId = existingWorkday.candidateId;
				const oldTimesheetId = existingWorkday.timesheetId;

				// Delete old workday
				await tx.delete(workdayTable).where(eq(workdayTable.id, existingWorkday.id));

				// If the old timesheet has no remaining workdays, delete it
				if (oldTimesheetId) {
					const remaining = await tx
						.select()
						.from(workdayTable)
						.where(eq(workdayTable.timesheetId, oldTimesheetId))
						.limit(1);
					if (remaining.length === 0) {
						await tx.delete(timesheetTable).where(eq(timesheetTable.id, oldTimesheetId));
					}
				}

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

				let newTimesheetId: string;

				if (existingTimesheet.length === 0) {
					newTimesheetId = crypto.randomUUID();
					await tx.insert(timesheetTable).values({
						id: newTimesheetId,
						createdAt: new Date(),
						updatedAt: new Date(),
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
				} else {
					newTimesheetId = existingTimesheet[0].id;
				}

				// Create new workday for the new candidate, linked to the timesheet
				const newWorkdayId = crypto.randomUUID();
				await tx.insert(workdayTable).values({
					id: newWorkdayId,
					candidateId: newCandidateId,
					requisitionId,
					recurrenceDayId,
					timesheetId: newTimesheetId,
					createdAt: new Date(),
					updatedAt: new Date()
				});

				// Keep recurrence day as FILLED since we still have someone assigned
				await tx
					.update(recurrenceDayTable)
					.set({ status: 'FILLED', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));

				return {
					oldCandidateId,
					recurrenceDay,
					newWorkdayId
				};
			});

			// Notify the candidate who lost their assignment (workday cancelled
			// from their POV), then notify the client that the day is filled
			// again with the new candidate.
			await notifyWorkdayDeleted({
				candidateId: reassignSnapshot.oldCandidateId,
				requisitionId,
				recurrenceDay: {
					date: reassignSnapshot.recurrenceDay.date,
					dayStart: reassignSnapshot.recurrenceDay.dayStart,
					dayEnd: reassignSnapshot.recurrenceDay.dayEnd
				}
			});
			await notifyWorkdayClaimed(reassignSnapshot.newWorkdayId);

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

			const cancelledSnapshot = await db.transaction(async (tx) => {
				// Capture the assigned candidate (if any) and the recurrence day
				// times BEFORE we mark the day cancelled and drop the workday row,
				// so the candidate-side notification has the data it needs.
				const recurrenceDay = await tx
					.select()
					.from(recurrenceDayTable)
					.where(eq(recurrenceDayTable.id, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				const workday = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1)
					.then((rows) => rows[0]);

				await tx
					.update(recurrenceDayTable)
					.set({ status: 'CANCELED', updatedAt: new Date() })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));

				await tx.delete(workdayTable).where(eq(workdayTable.recurrenceDayId, recurrenceDayId));

				return { recurrenceDay: recurrenceDay ?? null, workday: workday ?? null };
			});

			// If a candidate was on the day, let them know it was cancelled.
			if (cancelledSnapshot.workday && cancelledSnapshot.recurrenceDay) {
				await notifyWorkdayDeleted({
					candidateId: cancelledSnapshot.workday.candidateId,
					requisitionId: cancelledSnapshot.workday.requisitionId,
					recurrenceDay: {
						date: cancelledSnapshot.recurrenceDay.date,
						dayStart: cancelledSnapshot.recurrenceDay.dayStart,
						dayEnd: cancelledSnapshot.recurrenceDay.dayEnd
					}
				});
			}

			setFlash({ type: 'success', message: 'Workday successfully cancelled' }, event);
			return { success: true };
		} catch (error) {
			console.error('Error cancelling workday:', error);
			setFlash({ type: 'error', message: 'Failed to cancel workday' }, event);
			return fail(500, { error: error instanceof Error ? error.message : 'Unknown error' });
		}
	},

	// setAdjustedHourlyRate: async (event: RequestEvent) => {
	// 	const { locals } = event;
	// 	const user = locals.user;

	// 	if (!user) {
	// 		return fail(403, { error: 'Not authenticated' });
	// 	}

	// 	if (user.role !== USER_ROLES.SUPERADMIN) {
	// 		return fail(403, { error: 'Only admins can adjust the hourly rate' });
	// 	}

	// 	const form = await superValidate(event, adjustedHourlyRateSchema);

	// 	if (!form.valid) {
	// 		return fail(400, { form });
	// 	}

	// 	try {
	// 		const { timesheetId, adjustedHourlyRate } = form.data;

	// 		await db
	// 			.update(timesheetTable)
	// 			.set({
	// 				adjustedHourlyRate: adjustedHourlyRate,
	// 				updatedAt: new Date()
	// 			})
	// 			.where(eq(timesheetTable.id, timesheetId));

	// 		setFlash({ type: 'success', message: 'Hourly rate updated successfully' }, event);
	// 		return message(form, 'Rate updated');
	// 	} catch (error) {
	// 		console.error('Error updating adjusted hourly rate:', error);
	// 		setFlash({ type: 'error', message: 'Failed to update hourly rate' }, event);
	// 		return setError(form, 'Something went wrong');
	// 	}
	// },

	blacklistCandidate: async (_event: RequestEvent) => {}
};
