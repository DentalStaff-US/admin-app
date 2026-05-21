import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import { recurrenceDayTable } from '$lib/server/database/schemas/requisition';
import { and, eq, inArray, lt, or } from 'drizzle-orm';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processPastRecurrenceDays', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const today = new Date().toISOString().split('T')[0];
		const now = new Date();
		const currentTimeString = now;

		const pastRecurrenceDays = await db
			.select()
			.from(recurrenceDayTable)
			.where(
				and(
					eq(recurrenceDayTable.status, 'OPEN'),
					or(
						lt(recurrenceDayTable.date, today), // Earlier dates
						and(
							eq(recurrenceDayTable.date, today), // Today's date...
							lt(recurrenceDayTable.dayEnd, currentTimeString) // ...but end time passed
						)
					)
				)
			);
		if (pastRecurrenceDays.length === 0) {
			return json({
				success: true,
				message: 'Job ran successfuly with no recurrence days to process.',
				data: pastRecurrenceDays
			});
		}
		const ids = pastRecurrenceDays.map((day) => day.id);

		const updateResult = await db
			.update(recurrenceDayTable)
			.set({
				status: 'UNFULFILLED',
				updatedAt: new Date()
			})
			.where(inArray(recurrenceDayTable.id, ids))
			.returning();
		return json({
			success: true,
			message: 'Job ran successfuly!',
			data: updateResult.map((day) => ({ id: day.id, requisitionId: day.requisitionId }))
		});
	} catch (error) {
		logger.error('processPastRecurrenceDays job failed', { error });
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
