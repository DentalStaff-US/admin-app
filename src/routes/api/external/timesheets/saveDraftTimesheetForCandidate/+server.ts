/**
 * Save the candidate's in-progress timesheet without changing its status.
 *
 * Parallel to `submitTimesheetForCandidate`, but:
 *   - status stays DRAFT (no DRAFT→PENDING transition)
 *   - no client-notification email fires (no review action yet)
 *   - rejects anything not in DRAFT, since "save" only makes sense before
 *     submission. DISCREPANCY edits are admin-driven and have their own path.
 *
 * Used by the candidate's `saveDraftTimesheet` form action so they can amend
 * hours per shift as the week progresses (e.g. at the end of each day) and
 * persist the work-in-progress without locking themselves out of further
 * edits. The final DRAFT→PENDING transition is still gated by
 * `submitTimesheetForCandidate`'s rule that the latest shift in the week
 * has ended.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import {
	timeSheetTable,
	type RawTimesheetHours
} from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getCandidateProfileByUserId } from '$lib/server/database/queries/candidates';
import { z } from 'zod';
import { getRequisitionByWorkdayId } from '$lib/server/database/queries/requisitions';
import { createUTCDateTime } from '$lib/_helpers/UTCTimezoneUtils';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { logger } from '$lib/server/logger';

const draftTimesheetSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	weekStartDate: z.string().min(1, 'Week start date is required'),
	// `hours` allowed to be 0 so the candidate can save a row they cleared, or a
	// partial clock-in. `startTime` stays required (the row's anchor, and we need
	// it to convert to UTC), but `endTime` is optional for drafts — a prof can
	// save a clock-in now and add the end time later. Submit re-validates that
	// the end time is present.
	entries: z.array(
		z.object({
			workdayId: z.string().min(1, 'Workday ID is required'),
			hours: z.number().min(0),
			startTime: z.string().min(1, 'Start time is required'),
			endTime: z.string().optional(),
			lunchStartTime: z.string().optional(),
			lunchEndTime: z.string().optional(),
			date: z.string().min(1, 'Date is required')
		})
	),
	totalHours: z.number().min(0),
	timesheetId: z.string().min(1, 'Timesheet ID is required')
});

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const contentType = request.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			return json(
				{ success: false, message: 'Content-Type must be application/json' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		if (!body) {
			return json(
				{ success: false, message: 'Invalid JSON body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const parsed = draftTimesheetSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ success: false, message: parsed.error.errors[0].message },
				{ status: 400, headers: corsHeaders }
			);
		}

		const { userId, weekStartDate, entries, totalHours, timesheetId } = parsed.data;

		const candidateProfile = await getCandidateProfileByUserId(userId);
		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		// Resolve the requisition via any workday in the payload so we can
		// pull the reference timezone for UTC conversion. If there are no
		// entries (e.g. user clicked Save with everything cleared), there's
		// nothing to persist on hoursRaw — but we still want to record the
		// `totalHoursWorked = 0` reset.
		const firstWorkdayId = entries[0]?.workdayId;
		const requisition = firstWorkdayId
			? await getRequisitionByWorkdayId(firstWorkdayId)
			: null;

		// `createUTCDateTime` returns Date objects; Drizzle's JSON column type
		// serializes them to ISO strings on write, matching the wire shape of
		// `RawTimesheetHours` (which is typed as strings). Cast through unknown
		// to satisfy the static type — same pattern the submit endpoint uses.
		const formattedEntries = (
			requisition
				? entries.map((entry) => ({
						// Stable key back to the workday — see RawTimesheetHours.workdayId.
						workdayId: entry.workdayId,
						hours: entry.hours,
						date: entry.date,
						startTime: createUTCDateTime(
							entry.date,
							entry.startTime,
							requisition.referenceTimezone
						),
						// Optional on drafts — a partial clock-in may have no end time yet.
						endTime: entry.endTime
							? createUTCDateTime(entry.date, entry.endTime, requisition.referenceTimezone)
							: null,
						lunchStartTime: entry.lunchStartTime
							? createUTCDateTime(
									entry.date,
									entry.lunchStartTime,
									requisition.referenceTimezone
								)
							: null,
						lunchEndTime: entry.lunchEndTime
							? createUTCDateTime(entry.date, entry.lunchEndTime, requisition.referenceTimezone)
							: null
					}))
				: []
		) as unknown as RawTimesheetHours[];

		const weekStart = new Date(weekStartDate).toISOString().split('T')[0];

		// Save is only valid against a DRAFT timesheet that already belongs
		// to the candidate. The owner check is implicit via
		// associatedCandidateId. If somehow the timesheet has advanced past
		// DRAFT (admin moved it, cron raced, etc.) the save is refused so the
		// candidate's stale UI doesn't silently overwrite reviewed data.
		const [existingTimesheet] = await db
			.select()
			.from(timeSheetTable)
			.where(
				and(
					eq(timeSheetTable.id, timesheetId),
					eq(timeSheetTable.associatedCandidateId, candidateProfile.id),
					eq(timeSheetTable.weekBeginDate, weekStart),
					eq(timeSheetTable.status, 'DRAFT')
				)
			)
			.limit(1);

		if (!existingTimesheet) {
			return json(
				{
					success: false,
					message:
						'No draft timesheet available to save. It may have been submitted or is awaiting admin review.'
				},
				{ status: 409, headers: corsHeaders }
			);
		}

		const [result] = await db
			.update(timeSheetTable)
			.set({
				totalHoursWorked: totalHours.toString(),
				hoursRaw: formattedEntries,
				// status: 'DRAFT' — left as-is. This endpoint never advances state.
				updatedAt: new Date()
			})
			.where(eq(timeSheetTable.id, existingTimesheet.id))
			.returning();

		await writeActionHistory({
			action: 'UPDATE',
			userId: user.id,
			entityId: result.id,
			table: 'TIMESHEETS',
			beforeState: existingTimesheet,
			afterState: result
		});

		return json(
			{ success: true, message: 'Draft saved', data: result },
			{ status: 200, headers: corsHeaders }
		);
	} catch (err) {
		logger.error('timesheets.saveDraftTimesheetForCandidate failed', { error: err });
		return json(
			{ success: false, message: 'Internal server error' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
