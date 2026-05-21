import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	timeSheetTable,
	type RawTimesheetHours,
	type TimeSheet
} from '$lib/server/database/schemas/requisition';
import { requisitionTable } from '$lib/server/database/schemas/requisition';
import { workdayTable } from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { getClientIdByCompanyId } from '$lib/server/database/queries/clients';
import { getCandidateProfileByUserId } from '$lib/server/database/queries/candidates';
import { z } from 'zod';
import { getRequisitionByWorkdayId } from '$lib/server/database/queries/requisitions';
import { createUTCDateTime } from '$lib/_helpers/UTCTimezoneUtils';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { getPostHogClient } from '$lib/server/posthog';
import { notifyTimesheetSubmitted } from '$lib/server/notifications/transactional';
import { logger } from '$lib/server/logger';

const newTimesheetSchema = z.object({
	userId: z.string().min(1, 'User ID is required'),
	companyId: z.string().min(1, 'Company ID is required'),
	weekStartDate: z.string().min(1, 'Week start date is required'),
	entries: z.array(
		z.object({
			workdayId: z.string().min(1, 'Workday ID is required'),
			hours: z.number().min(1, 'Hours worked is required'),
			startTime: z.string().min(1, 'Start time is required'),
			endTime: z.string().min(1, 'End time is required'),
			lunchStartTime: z.string().optional(),
			lunchEndTime: z.string().optional(),
			date: z.string().min(1, 'Date is required')
		})
	),
	totalHours: z.number().min(1, 'Total hours is required'),
	timesheetId: z.string().optional()
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
		// Validate content type
		const contentType = request.headers.get('content-type');
		if (!contentType?.includes('application/json')) {
			return json(
				{ success: false, message: 'Content-Type must be application/json' },
				{ status: 400, headers: corsHeaders }
			);
		}

		// Authenticate user
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		// Validate request body
		const body = await request.json().catch((err) => console.log(err));

		if (!body) {
			return json(
				{ success: false, message: 'Invalid JSON body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const parsedBody = newTimesheetSchema.safeParse(body);
		if (!parsedBody.success) {
			return json(
				{ success: false, message: parsedBody.error.errors[0].message },
				{ status: 400, headers: corsHeaders }
			);
		}

		console.log('Parsed body:', parsedBody.data);
		const { userId, companyId, weekStartDate, entries, timesheetId } = parsedBody.data;

		const candidateProfile = await getCandidateProfileByUserId(userId);
		const clientId = await getClientIdByCompanyId(companyId);

		const workdayIds = entries.map((entry) => entry.workdayId);

		const timesheetEntries: RawTimesheetHours[] = entries.map((entry) => ({
			hours: entry.hours,
			startTime: entry.startTime,
			endTime: entry.endTime,
			lunchStartTime: entry.lunchStartTime,
			lunchEndTime: entry.lunchEndTime,
			date: entry.date
		}));

		const workdayId = workdayIds[0];
		const requisition = await getRequisitionByWorkdayId(workdayId);
		const weekStart = new Date(weekStartDate).toISOString().split('T')[0];

		const formattedEntries = timesheetEntries.map((entry) => ({
			...entry,
			startTime: createUTCDateTime(entry.date, entry.startTime, requisition!.referenceTimezone),
			endTime: createUTCDateTime(entry.date, entry.endTime, requisition!.referenceTimezone),
			// ✅ Only set lunch times if they're actually provided
			lunchStartTime: entry.lunchStartTime
				? createUTCDateTime(entry.date, entry.lunchStartTime, requisition!.referenceTimezone)
				: null,
			lunchEndTime: entry.lunchEndTime
				? createUTCDateTime(entry.date, entry.lunchEndTime, requisition!.referenceTimezone)
				: null
		}));

		console.log('Formatted Entries:', formattedEntries);

		// Check for existing DRAFT/DISCREPANCY timesheet
		const [existingTimesheet] = await db
			.select()
			.from(timeSheetTable)
			.where(
				and(
					eq(timeSheetTable.associatedCandidateId, candidateProfile.id),
					eq(timeSheetTable.weekBeginDate, weekStart),
					eq(timeSheetTable.requisitionId, requisition?.id),
					inArray(timeSheetTable.status, ['DRAFT', 'DISCREPANCY']),
					timesheetId ? eq(timeSheetTable.id, timesheetId) : undefined
				)
			)
			.limit(1);

		let result;

		if (existingTimesheet) {
			console.log('Existing Timesheet:', existingTimesheet);
			// ✅ UPDATE EXISTING DRAFT TIMESHEET
			[result] = await db
				.update(timeSheetTable)
				.set({
					totalHoursWorked: parsedBody.data.totalHours.toString(),
					hoursRaw: formattedEntries,
					status: 'PENDING', // ✅ Change from DRAFT to PENDING
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
		} else {
			// Timesheet creation is owned exclusively by the
			// processTimesheetCreation cron job. If there's no DRAFT/DISCREPANCY
			// timesheet for this week, the cron either hasn't run yet (shift may
			// still be upcoming) or this submission is for a shift that doesn't
			// belong to the candidate. Either way, we refuse to create one here
			// — surfaces a clear error rather than papering over a deeper bug.
			return json(
				{
					success: false,
					message:
						'No timesheet is available to submit for this shift yet. Please try again after the shift has started.'
				},
				{ status: 409, headers: corsHeaders }
			);
		}

		await writeActionHistory({
			action: 'CREATE',
			userId: user.id,
			entityId: result.id,
			table: 'TIMESHEETS',
			beforeState: {},
			afterState: result
		});

		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: user.id,
			event: 'timesheet_submitted',
			properties: {
				timesheet_id: result.id,
				requisition_id: requisition?.id,
				company_id: companyId,
				week_start: weekStart,
				total_hours: parsedBody.data.totalHours,
				entry_count: entries.length
			}
		});

		// Notify the client that a timesheet is awaiting their approval.
		await notifyTimesheetSubmitted(result.id);

		return json(
			{ success: true, message: 'Timesheet submitted successfully', data: result },
			{
				status: 200,
				headers: corsHeaders
			}
		);
	} catch (err) {
		if (err instanceof Error && 'status' in err && 'body' in err) {
			return json(
				{ success: false, message: (err as any).body.message },
				{
					status: (err as any).status,
					headers: corsHeaders
				}
			);
		}

		logger.error('timesheets.submitTimesheetForCandidate failed', { error: err });
		return json(
			{ success: false, message: 'Internal server error' },
			{
				status: 500,
				headers: corsHeaders
			}
		);
	}
};
