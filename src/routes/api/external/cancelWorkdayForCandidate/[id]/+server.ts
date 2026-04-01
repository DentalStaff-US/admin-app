import { json } from '@sveltejs/kit';
import type { RequestHandler } from '../$types';
import db from '$lib/server/database/drizzle';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	requisitionTable,
	workdayTable,
	recurrenceDayTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

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

		return await db.transaction(async (tx) => {
			const [existingWorkday] = await tx
				.select()
				.from(workdayTable)
				.where(eq(workdayTable.id, id))
				.limit(1);

			if (!existingWorkday) {
				return json(
					{ success: false, message: 'Application not found for this workday' },
					{ status: 409, headers: corsHeaders }
				);
			}
			const timesheetId = existingWorkday.timesheetId;

			await tx.delete(workdayTable).where(eq(workdayTable.id, existingWorkday.id));

			if (timesheetId) {
				const remainingWorkdays = await tx
					.select()
					.from(workdayTable)
					.where(eq(workdayTable.timesheetId, timesheetId))
					.limit(1);

				if (remainingWorkdays.length === 0) {
					await tx
						.delete(timeSheetTable)
						.where(and(eq(timeSheetTable.id, timesheetId), eq(timeSheetTable.status, 'DRAFT')));
				}
			}

			// Change Status of the recurrence day
			const [updatedRecurrenceDay] = await tx
				.update(recurrenceDayTable)
				.set({ status: 'OPEN' })
				.where(eq(recurrenceDayTable.id, existingWorkday.recurrenceDayId as string))
				.returning();

			// TODO Update any relevant data for the candidate
			// TODO Notify the client of a cancelled workday

			return json(
				{
					success: true,
					data: {
						workday: {
							id: updatedRecurrenceDay.id
						}
					}
				},
				{ headers: corsHeaders }
			);
		});
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
