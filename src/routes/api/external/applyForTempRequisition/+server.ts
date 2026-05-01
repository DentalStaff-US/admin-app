import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import {
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import {
	requisitionTable,
	workdayTable,
	recurrenceDayTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq } from 'drizzle-orm';
import { CANDIDATE_APP_DOMAIN } from '$env/static/private';
import { notifyWorkdayClaimed } from '$lib/server/notifications/transactional';
import { getClientIdByCompanyId } from '$lib/server/database/queries/clients';

const corsHeaders = {
	'Access-Control-Allow-Origin': CANDIDATE_APP_DOMAIN,
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
		const body = await request.json().catch(() => null);
		if (!body) {
			return json(
				{ success: false, message: 'Invalid request body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const { recurrenceDayId } = body;

		// Run the DB work in a transaction; return either a JSON Response (early
		// failures) or a result object so the caller can fire notifications AFTER
		// the transaction commits.
		const txResult = await db.transaction(
			async (
				tx
			): Promise<
				| { kind: 'response'; response: Response }
				| { kind: 'success'; workdayId: string; createdAt: Date }
			> => {
				// Get candidate profile
				const candidateProfile = await tx
					.select()
					.from(candidateProfileTable)
					.where(eq(candidateProfileTable.userId, user.id))
					.limit(1)
					.then((rows) => rows[0]);

				if (!candidateProfile) {
					return {
						kind: 'response',
						response: json(
							{ success: false, message: 'Candidate profile not found' },
							{ status: 404, headers: corsHeaders }
						)
					};
				}

				// Verify requisition exists and is active
				const [recurrenceDay] = await tx
					.select({
						requisition: { ...requisitionTable },
						recurrenceDay: { ...recurrenceDayTable }
					})
					.from(recurrenceDayTable)
					.innerJoin(requisitionTable, eq(recurrenceDayTable.requisitionId, requisitionTable.id))
					.where(
						and(eq(recurrenceDayTable.id, recurrenceDayId), eq(requisitionTable.status, 'OPEN'))
					)
					.limit(1);

				if (!recurrenceDay) {
					return {
						kind: 'response',
						response: json(
							{ success: false, message: 'Requisition not found or not active' },
							{ status: 404, headers: corsHeaders }
						)
					};
				}

				const clientId = await getClientIdByCompanyId(recurrenceDay.requisition.companyId);

				// Check if workday exists for this candidate and this recurrence day/requisition
				const [existingWorkday] = await tx
					.select()
					.from(workdayTable)
					.where(
						and(
							eq(workdayTable.requisitionId, recurrenceDay.requisition.id),
							eq(workdayTable.recurrenceDayId, recurrenceDayId),
							eq(workdayTable.candidateId, candidateProfile.id)
						)
					)
					.limit(1);

				if (existingWorkday) {
					return {
						kind: 'response',
						response: json(
							{
								success: false,
								message: 'You have already applied for this requisition workday'
							},
							{ status: 409, headers: corsHeaders }
						)
					};
				}

				const disciplines = await tx
					.select()
					.from(candidateDisciplineExperienceTable)
					.where(eq(candidateDisciplineExperienceTable.candidateId, candidateProfile.id));

				// Check if Candidate is qualified for this workday
				if (
					!disciplines.some(
						(disc) => disc.disciplineId === recurrenceDay.requisition.disciplineId
					)
				) {
					return {
						kind: 'response',
						response: json(
							{
								success: false,
								message: 'You do not have the required discipline experience for this position'
							},
							{ status: 403, headers: corsHeaders }
						)
					};
				}

				// Create a Workday for this temp requisition for this recurrence day
				const [newWorkday] = await tx
					.insert(workdayTable)
					.values({
						id: crypto.randomUUID(),
						createdAt: new Date(),
						updatedAt: new Date(),
						candidateId: candidateProfile.id,
						requisitionId: recurrenceDay.requisition.id,
						recurrenceDayId
					})
					.returning();

				const weekStart = new Date(recurrenceDay.recurrenceDay.date);
				// Set to beginning of week (Sunday)
				const dayOfWeek = weekStart.getDay();
				weekStart.setDate(weekStart.getDate() - dayOfWeek);
				const weekStartStr = weekStart.toISOString().split('T')[0];

				// Check if a draft timesheet already exists for this week
				const [existingTimesheet] = await tx
					.select()
					.from(timeSheetTable)
					.where(
						and(
							eq(timeSheetTable.associatedCandidateId, candidateProfile.id),
							eq(timeSheetTable.weekBeginDate, weekStartStr),
							eq(timeSheetTable.requisitionId, recurrenceDay.requisition.id)
						)
					)
					.limit(1);

				if (!existingTimesheet) {
					// Create a new DRAFT timesheet for this week
					await tx.insert(timeSheetTable).values({
						id: crypto.randomUUID(),
						createdAt: new Date(),
						updatedAt: new Date(),
						associatedCandidateId: candidateProfile.id,
						associatedClientId: clientId,
						requisitionId: recurrenceDay.requisition.id,
						weekBeginDate: weekStartStr,
						totalHoursWorked: '0',
						hoursRaw: [],
						status: 'DRAFT',
						validated: false,
						awaitingClientSignature: false
					});
				}

				// Change Status of the recurrence day
				await tx
					.update(recurrenceDayTable)
					.set({ status: 'FILLED' })
					.where(eq(recurrenceDayTable.id, recurrenceDayId));

				return { kind: 'success', workdayId: newWorkday.id, createdAt: newWorkday.createdAt };
			}
		);

		if (txResult.kind === 'response') {
			return txResult.response;
		}

		// Fire transactional notification AFTER the DB transaction has committed.
		// Dispatcher swallows its own errors — failure won't poison this response.
		await notifyWorkdayClaimed(txResult.workdayId);

		return json(
			{
				success: true,
				data: {
					workday: {
						id: txResult.workdayId,
						createdAt: txResult.createdAt
					}
				}
			},
			{ headers: corsHeaders }
		);
	} catch (err) {
		console.error('Error in POST /api/external/applyForTempRequisition:', err);
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
