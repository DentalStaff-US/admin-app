import db from '$lib/server/database/drizzle';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { recurrenceDayTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processOutdatedRequisitions', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0]; // Format as YYYY-MM-DD

		// Get all requisitions with their recurrence days stats
		const requisitionsWithStats = await db
			.select({
				requisitionId: requisitionTable.id,
				totalDays: sql<number>`count(${recurrenceDayTable.id})`.mapWith(Number),
				filledDays:
					sql<number>`count(case when ${recurrenceDayTable.status} = 'FILLED' then 1 end)`.mapWith(
						Number
					),
				latestDate: sql<string>`max(${recurrenceDayTable.date})`.mapWith(String)
			})
			.from(requisitionTable)
			.leftJoin(recurrenceDayTable, eq(recurrenceDayTable.requisitionId, requisitionTable.id))
			.where(
				and(
					eq(requisitionTable.status, 'OPEN'),
					eq(requisitionTable.archived, false),
					eq(requisitionTable.permanentPosition, false)
				)
			)
			.groupBy(requisitionTable.id);

		const outdatedRequisitions = requisitionsWithStats.filter(
			(req) => req.latestDate && req.latestDate < oneWeekAgoStr
		);

		// Separate into CANCELLED and UNFULFILLED based on filled days
		const cancelledReqs = outdatedRequisitions
			.filter((req) => req.filledDays === 0)
			.map((req) => req.requisitionId);

		const unfilledReqs = outdatedRequisitions
			.filter((req) => req.filledDays > 0)
			.map((req) => req.requisitionId);

		if (cancelledReqs.length > 0) {
			await db
				.update(requisitionTable)
				.set({
					status: 'CANCELED',
					updatedAt: new Date()
				})
				.where(inArray(requisitionTable.id, cancelledReqs));
		}

		if (unfilledReqs.length > 0) {
			await db
				.update(requisitionTable)
				.set({
					status: 'UNFULFILLED',
					updatedAt: new Date()
				})
				.where(inArray(requisitionTable.id, unfilledReqs));
		}
		return json({
			success: true,
			updated: cancelledReqs.length + unfilledReqs.length,
			cancelled: cancelledReqs.length,
			unfulfilled: unfilledReqs.length
		});
	} catch (error) {
		logger.error('processPastRequisitions job failed', { error });
		return json(
			{ success: false, error: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};
