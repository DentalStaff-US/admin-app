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
	computeWeekBeginDate,
	deleteRecurrenceDay,
	editRecurrenceDay,
	getRecurrenceDayDetails,
	getRequisitionDetailsById,
	getWorkdayDetails,
	linkWorkdayToOpenTimesheet
} from '$lib/server/database/queries/requisitions';
import { USER_ROLES } from '$lib/config/constants';
import { assertCanAccessLocation } from '$lib/server/scoping';
import { getClientProfileByIdAdmin } from '$lib/server/database/queries/admin';
import { getQualifiedProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
import { addCandidateToBlacklist } from '$lib/server/database/queries/blacklist';
import { getDefaultSearchRadius } from '$lib/server/database/queries/config';
import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable,
	timeSheetTable as timesheetTable
} from '$lib/server/database/schemas/requisition';
import {
	maybeCleanupOrphanTimesheet,
	recordRecurrenceDayCancellation,
	stripWorkdayFromTimesheet
} from '$lib/server/cancellations';
import { and, eq, inArray } from 'drizzle-orm';
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

		const { miles: defaultSearchRadiusMiles } = await getDefaultSearchRadius();
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
			defaultSearchRadiusMiles,
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
		const { miles: defaultSearchRadiusMiles } = await getDefaultSearchRadius();
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
			defaultSearchRadiusMiles,
			editWorkdayScheduleForm
		};
	}

	if (user.role === 'CLIENT_STAFF') {
		const client = await getClientProfileByStaffUserId(user.id);
		const company = await getClientCompanyByClientId(client?.id);
		const requisition = await getRequisitionDetailsById(requisitionId);
		// Access guard: staff must be assigned to this requisition's location
		// (which is the workday's effective location).
		await assertCanAccessLocation(user, requisition?.requisition?.locationId);
		const recurrenceDay = await getRecurrenceDayDetails(recurrenceDayId, company.id);
		const workday = await getWorkdayDetails(recurrenceDayId, company.id);
		const location = await getLocationByIdForCompany(
			requisition.requisition.locationId,
			company.id
		);
		const { miles: defaultSearchRadiusMiles } = await getDefaultSearchRadius();
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
			defaultSearchRadiusMiles,
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
				const [existingWorkday] = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.recurrenceDayId, recurrenceDayId))
					.limit(1);

				// A still-active workday means the day is genuinely already filled.
				// A soft-cancelled one must NOT block (re)assignment — it has to be
				// revived below, otherwise its lingering `cancelledAt` keeps the day
				// invisible to the timesheet cron forever (no sheet ever generates).
				if (existingWorkday && !existingWorkday.cancelledAt) {
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

				let workdayId: string;
				if (existingWorkday) {
					// Revive the soft-cancelled workday instead of orphaning it beside a
					// new row: clear the cancel, (re)assign the candidate, and drop any
					// stale timesheet link so the cron relinks or builds a fresh sheet.
					// This is the missing inverse of cancelWorkday.
					workdayId = existingWorkday.id;
					await tx
						.update(workdayTable)
						.set({
							candidateId,
							cancelledAt: null,
							timesheetId: null,
							updatedAt: new Date()
						})
						.where(eq(workdayTable.id, workdayId));
				} else {
					workdayId = crypto.randomUUID();
					await tx.insert(workdayTable).values({
						id: workdayId,
						candidateId,
						requisitionId,
						recurrenceDayId,
						createdAt: new Date(),
						updatedAt: new Date()
					});
				}

				// Proactively attach to the candidate's open timesheet for this
				// requisition+week (if any) so a day assigned after the timesheet
				// exists doesn't fragment into a second one.
				await linkWorkdayToOpenTimesheet(tx, {
					workdayId,
					candidateId,
					requisitionId,
					dayStart: recurrenceDay.dayStart,
					referenceTimezone: requisition.referenceTimezone
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
						// Genuinely empty now — drop the orphan sheet.
						await tx.delete(timesheetTable).where(eq(timesheetTable.id, timesheetId));
					} else {
						// Other days remain — keep the sheet, strip this day's hours.
						await stripWorkdayFromTimesheet(tx, {
							timesheetId,
							workdayId: workday.id,
							date: recurrenceDay?.date
						});
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

				if (oldTimesheetId) {
					const remaining = await tx
						.select()
						.from(workdayTable)
						.where(eq(workdayTable.timesheetId, oldTimesheetId))
						.limit(1);
					if (remaining.length === 0) {
						// Genuinely empty now — drop the orphan sheet.
						await tx.delete(timesheetTable).where(eq(timesheetTable.id, oldTimesheetId));
					} else {
						// Other days remain — keep the sheet, just strip this day's hours
						// so they don't linger (and don't bill) on the old candidate's sheet.
						await stripWorkdayFromTimesheet(tx, {
							timesheetId: oldTimesheetId,
							workdayId: existingWorkday.id
						});
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

				// Monday-of-week in the requisition's timezone — same calc as the
				// cron and the proactive linker, so all sites agree on the boundary.
				const weekStartStr = computeWeekBeginDate(
					recurrenceDay.dayStart,
					requisition.referenceTimezone
				);

				// Reuse only an OPEN timesheet for the new candidate this week; a
				// terminal (APPROVED/VOID) sheet must not absorb the reassigned day.
				const existingTimesheet = await tx
					.select()
					.from(timesheetTable)
					.where(
						and(
							eq(timesheetTable.associatedCandidateId, newCandidateId),
							eq(timesheetTable.weekBeginDate, weekStartStr),
							eq(timesheetTable.requisitionId, requisitionId),
							inArray(timesheetTable.status, ['DRAFT', 'PENDING', 'DISCREPANCY'])
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
						status: 'DRAFT',
						validated: false,
						awaitingClientSignature: true
					});
				} else {
					newTimesheetId = existingTimesheet[0].id;
					// A reassigned day joined an already-submitted sheet — reopen it so
					// the new candidate's hours get entered before re-submission. Mirrors
					// the reopen in linkWorkdayToOpenTimesheet / attachWeeksToTimesheets.
					if (existingTimesheet[0].status === 'PENDING') {
						await tx
							.update(timesheetTable)
							.set({ status: 'DRAFT', updatedAt: new Date() })
							.where(eq(timesheetTable.id, newTimesheetId));
					}
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
				// times BEFORE we change anything so the candidate-side
				// notification has the data it needs.
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

				// Keep the workday row around (don't delete it). Marking it
				// cancelled lets the candidate calendar surface the cancelled
				// shift, while timesheet reads filter on `cancelledAt IS NULL`
				// so the cancelled day won't count toward hours.
				if (workday) {
					await tx
						.update(workdayTable)
						.set({ cancelledAt: new Date(), updatedAt: new Date() })
						.where(eq(workdayTable.id, workday.id));

					// Strip the cancelled day's hours from the sheet so they don't
					// linger in hours_raw (where they'd otherwise read as an
					// UNAUTHORIZED_WORKDAY discrepancy) and don't bill.
					await stripWorkdayFromTimesheet(tx, {
						timesheetId: workday.timesheetId,
						workdayId: workday.id,
						date: recurrenceDay?.date
					});
				}

				// Audit row. Records WHO cancelled and WHEN, plus a snapshot of
				// shift start + hours-before-shift for future penalty rules.
				await recordRecurrenceDayCancellation(tx, {
					recurrenceDayId,
					requisitionId: recurrenceDay?.requisitionId ?? workday?.requisitionId ?? 0,
					cancelledByUserId: user.id,
					cancelledByRole: user.role as 'SUPERADMIN' | 'CLIENT' | 'CLIENT_STAFF',
					candidateId: workday?.candidateId ?? null
				});

				// If this cancellation lands on Sunday (the last day of the
				// Mon→Sun work week) and the timesheet has no other active
				// workdays attached, sweep the now-empty DRAFT timesheet.
				if (workday?.timesheetId && recurrenceDay?.date) {
					await maybeCleanupOrphanTimesheet(tx, {
						timesheetId: workday.timesheetId,
						recurrenceDate: recurrenceDay.date
					});
				}

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

	// Blacklist the workday's candidate from this requisition's company. Clears
	// their future shifts for the company and keeps them out of the qualified
	// search going forward. Candidate + company are resolved server-side.
	blacklistCandidate: async (event: RequestEvent) => {
		const { locals, params, request } = event;
		const user = locals.user;
		if (!user) return fail(403, { error: 'Not authenticated' });
		if (![USER_ROLES.SUPERADMIN, 'CLIENT', 'CLIENT_STAFF'].includes(user.role)) {
			return fail(403, { error: 'Not authorized' });
		}

		const formData = await request.formData();
		const requisitionId = Number(params.id);

		// Prefer an explicit candidateId from the form; fall back to the workday.
		let candidateId = String(formData.get('candidateId') ?? '').trim();
		if (!candidateId) {
			const [workday] = await db
				.select({ candidateId: workdayTable.candidateId })
				.from(workdayTable)
				.where(eq(workdayTable.id, params.workdayId))
				.limit(1);
			candidateId = workday?.candidateId ?? '';
		}
		if (!candidateId) return fail(400, { error: 'No candidate to blacklist' });

		const [requisition] = await db
			.select({ companyId: requisitionTable.companyId })
			.from(requisitionTable)
			.where(eq(requisitionTable.id, requisitionId))
			.limit(1);
		if (!requisition) return fail(404, { error: 'Requisition not found' });

		try {
			const { cancelledWorkdays } = await addCandidateToBlacklist(
				candidateId,
				requisition.companyId,
				{
					actorUserId: user.id,
					actorRole: user.role as 'SUPERADMIN' | 'CLIENT' | 'CLIENT_STAFF',
					reason: 'admin'
				}
			);
			setFlash(
				{
					type: 'success',
					message:
						cancelledWorkdays > 0
							? `Candidate blacklisted. ${cancelledWorkdays} future shift(s) cancelled.`
							: 'Candidate blacklisted.'
				},
				event
			);
			return { success: true };
		} catch (err) {
			console.error('Error blacklisting candidate:', err);
			setFlash({ type: 'error', message: 'Failed to blacklist candidate' }, event);
			return fail(500, { error: 'Failed to blacklist candidate' });
		}
	},

	// Admin-only hard-archive of this workday. Mirrors the requisition-page
	// `deleteRecurrenceDay` action (snapshot for notification, soft-delete via
	// `deleteRecurrenceDay`, notify if a candidate was assigned). Clients
	// should cancel via `cancelWorkday` instead.
	deleteWorkday: async (event: RequestEvent) => {
		const { request, locals, params } = event;
		const user = locals.user;
		if (!user) return fail(403);
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { error: 'Admin only' });

		const recurrenceDayId = params.workdayId;
		if (!recurrenceDayId) return fail(400, { error: 'Missing workday id' });

		try {
			const [snapshot] = await db
				.select({
					candidateId: workdayTable.candidateId,
					requisitionId: workdayTable.requisitionId,
					date: recurrenceDayTable.date,
					dayStart: recurrenceDayTable.dayStart,
					dayEnd: recurrenceDayTable.dayEnd
				})
				.from(recurrenceDayTable)
				.leftJoin(workdayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
				.where(eq(recurrenceDayTable.id, recurrenceDayId))
				.limit(1);

			await deleteRecurrenceDay(recurrenceDayId, user.id);

			if (snapshot?.candidateId && snapshot.requisitionId !== null) {
				await notifyWorkdayDeleted({
					candidateId: snapshot.candidateId,
					requisitionId: snapshot.requisitionId,
					recurrenceDay: {
						date: snapshot.date,
						dayStart: snapshot.dayStart,
						dayEnd: snapshot.dayEnd
					}
				});
			}

			setFlash({ type: 'success', message: 'Workday deleted' }, request);
			// Redirect back to the requisition page since this workday no longer exists.
			throw redirect(303, `/requisitions/${params.id}`);
		} catch (err) {
			// SvelteKit redirects throw — let those bubble up.
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
			console.error(err);
			setFlash({ type: 'error', message: 'Failed to delete workday' }, request);
			return fail(500, { error: 'Failed to delete workday' });
		}
	}
};
