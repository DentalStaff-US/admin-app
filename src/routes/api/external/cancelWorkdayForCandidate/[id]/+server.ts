import { json } from '@sveltejs/kit';
import type { RequestHandler } from '../$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { workdayTable, recurrenceDayTable } from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { notifyWorkdayReposted } from '$lib/server/notifications/transactional';
import {
	maybeCleanupOrphanTimesheet,
	recordRecurrenceDayCancellation
} from '$lib/server/cancellations';

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

export const POST: RequestHandler = async ({ request, params }) => {
	console.log('POST /api/external/cancelWorkdayForCandidate');
	console.log({ params });
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
		console.log('User attempting to cancel shift:', { userId: user.id });
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const { id } = params;

		const txResult = await db.transaction(
			async (
				tx
			): Promise<
				| { kind: 'response'; response: Response }
				| {
						kind: 'success';
						recurrenceDayId: string;
						candidateId: string;
						requisitionId: number;
				  }
			> => {
				const [existingWorkday] = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.id, id))
					.limit(1);

				if (!existingWorkday) {
					return {
						kind: 'response',
						response: json(
							{ success: false, message: 'Application not found for this workday' },
							{ status: 409, headers: corsHeaders }
						)
					};
				}

				if (!existingWorkday.recurrenceDayId) {
					return {
						kind: 'response',
						response: json(
							{ success: false, message: 'Workday has no recurrence day attached' },
							{ status: 409, headers: corsHeaders }
						)
					};
				}

				const timesheetId = existingWorkday.timesheetId;

				// Audit row BEFORE we delete the workday — the helper needs to
				// look up the recurrence day's shift start to snapshot it, and
				// once the workday is gone we lose the only association.
				await recordRecurrenceDayCancellation(tx, {
					recurrenceDayId: existingWorkday.recurrenceDayId,
					requisitionId: existingWorkday.requisitionId,
					cancelledByUserId: user.id,
					cancelledByRole: 'CANDIDATE',
					candidateId: existingWorkday.candidateId
				});

				// Candidate cancels release the slot back to the pool, so the
				// workday itself is deleted (vs the admin path which keeps it
				// with a `cancelledAt` flag so the cancelled day stays visible).
				await tx.delete(workdayTable).where(eq(workdayTable.id, existingWorkday.id));

				// Empty-timesheet cleanup runs only on Sunday (last day of the
				// Mon→Sun work week) so mid-week cancellations don't prematurely
				// remove a timesheet other workdays could still attach to. Pull
				// the recurrence day's date for the day-of-week check.
				if (timesheetId) {
					const [recurrenceDay] = await tx
						.select({ date: recurrenceDayTable.date })
						.from(recurrenceDayTable)
						.where(eq(recurrenceDayTable.id, existingWorkday.recurrenceDayId))
						.limit(1);

					if (recurrenceDay?.date) {
						await maybeCleanupOrphanTimesheet(tx, {
							timesheetId,
							recurrenceDate: recurrenceDay.date
						});
					}
				}

				// Change Status of the recurrence day
				const [updatedRecurrenceDay] = await tx
					.update(recurrenceDayTable)
					.set({ status: 'OPEN' })
					.where(eq(recurrenceDayTable.id, existingWorkday.recurrenceDayId))
					.returning();

				return {
					kind: 'success',
					recurrenceDayId: updatedRecurrenceDay.id,
					candidateId: existingWorkday.candidateId,
					requisitionId: existingWorkday.requisitionId
				};
			}
		);

		if (txResult.kind === 'response') {
			return txResult.response;
		}

		// Fire notification after the DB transaction commits.
		await notifyWorkdayReposted({
			candidateId: txResult.candidateId,
			requisitionId: txResult.requisitionId,
			recurrenceDayId: txResult.recurrenceDayId
		});

		return json(
			{
				success: true,
				data: {
					workday: {
						id: txResult.recurrenceDayId
					}
				}
			},
			{ headers: corsHeaders }
		);
	} catch (err) {
		console.error('Error in POST /api/external/cancelWorkdayForCandidate:', err);
		// Determine if error is known/expected
		if (err instanceof Error && 'status' in err && 'body' in err) {
			return json(
				{ success: false, message: (err as any).body.message },
				{
					status: (err as any).status,
					headers: corsHeaders
				}
			);
		}

		// Unknown error
		return json(
			{ success: false, message: 'Internal server error' },
			{
				status: 500,
				headers: corsHeaders
			}
		);
	}
};
