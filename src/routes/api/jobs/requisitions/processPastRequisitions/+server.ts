import db from '$lib/server/database/drizzle';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { recurrenceDayTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { verifyJobRequest } from '$lib/server/jobs/sign';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processOutdatedRequisitions', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	try {
		console.log('Starting closeOutdatedRequisitionsJob');

		// Get one week ago date
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

		console.log(`Found ${requisitionsWithStats.length} requisitions to check`);

		// Filter for outdated requisitions
		const outdatedRequisitions = requisitionsWithStats.filter(
			(req) => req.latestDate && req.latestDate < oneWeekAgoStr
		);

		console.log(`Found ${outdatedRequisitions.length} outdated requisitions to close`);

		// Separate into CANCELLED and UNFULFILLED based on filled days
		const cancelledReqs = outdatedRequisitions
			.filter((req) => req.filledDays === 0)
			.map((req) => req.requisitionId);

		const unfilledReqs = outdatedRequisitions
			.filter((req) => req.filledDays > 0)
			.map((req) => req.requisitionId);

		// Update CANCELLED requisitions
		if (cancelledReqs.length > 0) {
			const cancelledResult = await db
				.update(requisitionTable)
				.set({
					status: 'CANCELED',
					updatedAt: new Date()
				})
				.where(inArray(requisitionTable.id, cancelledReqs))
				.returning();

			console.log(`Updated ${cancelledResult.length} requisitions to CANCELLED`);
		}

		// Update UNFULFILLED requisitions
		if (unfilledReqs.length > 0) {
			const unfilledResult = await db
				.update(requisitionTable)
				.set({
					status: 'UNFULFILLED',
					updatedAt: new Date()
				})
				.where(inArray(requisitionTable.id, unfilledReqs))
				.returning();

			console.log(`Updated ${unfilledResult.length} requisitions to UNFULFILLED`);
		}
		return json({
			success: true,
			updated: cancelledReqs.length + unfilledReqs.length,
			cancelled: cancelledReqs.length,
			unfulfilled: unfilledReqs.length
		});
	} catch (error) {
		console.error('Error closing outdated requisitions:', error);
		return json({ success: false, error: error }, { status: 500 });
	}
};
