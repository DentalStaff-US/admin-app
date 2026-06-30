import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/database/drizzle';
import {
	candidateBlacklistTable,
	candidateDisciplineExperienceTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import {
	requisitionTable,
	workdayTable,
	recurrenceDayTable
} from '$lib/server/database/schemas/requisition';
import { experienceLevelTable } from '$lib/server/database/schemas/skill';
import { authenticateUser } from '$lib/server/serverUtils';
import { and, eq } from 'drizzle-orm';
import { CANDIDATE_APP_DOMAIN } from '$env/static/private';
import { notifyWorkdayClaimed } from '$lib/server/notifications/transactional';
import { checkCandidateQualified } from '$lib/server/qualifyCandidate';
import { linkWorkdayToOpenTimesheet } from '$lib/server/database/queries/requisitions';
import { isClientActiveByCompanyId } from '$lib/server/clientStatusGuards';
import { logger } from '$lib/server/logger';

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

				// The candidate's OWN account must be ACTIVE to claim a shift.
				if (candidateProfile.status !== 'ACTIVE') {
					return {
						kind: 'response',
						response: json(
							{
								success: false,
								message: 'Your account is not active. You cannot claim shifts yet.',
								reason: 'account_status'
							},
							{ status: 403, headers: corsHeaders }
						)
					};
				}

				// Verify requisition exists and is active. LeftJoin experience_levels
				// so we can read the required order for the qualification check.
				const [recurrenceDay] = await tx
					.select({
						requisition: { ...requisitionTable },
						recurrenceDay: { ...recurrenceDayTable },
						experienceLevelOrder: experienceLevelTable.order
					})
					.from(recurrenceDayTable)
					.innerJoin(requisitionTable, eq(recurrenceDayTable.requisitionId, requisitionTable.id))
					.leftJoin(
						experienceLevelTable,
						eq(experienceLevelTable.id, requisitionTable.experienceLevelId)
					)
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

				// Block claims on shifts whose owning business isn't ACTIVE.
				if (!(await isClientActiveByCompanyId(recurrenceDay.requisition.companyId))) {
					return {
						kind: 'response',
						response: json(
							{ success: false, message: 'This shift is not currently available.' },
							{ status: 403, headers: corsHeaders }
						)
					};
				}

				// Block claims if the candidate is blacklisted from the owning company
				// (symmetric blacklist). Mirrors the listing-feed exclusion so a stale
				// client can't apply to a shift that should be hidden from them.
				const [blacklisted] = await tx
					.select({ candidateId: candidateBlacklistTable.candidateId })
					.from(candidateBlacklistTable)
					.where(
						and(
							eq(candidateBlacklistTable.candidateId, candidateProfile.id),
							eq(candidateBlacklistTable.companyId, recurrenceDay.requisition.companyId)
						)
					)
					.limit(1);
				if (blacklisted) {
					return {
						kind: 'response',
						response: json(
							{ success: false, message: 'This shift is not currently available.' },
							{ status: 403, headers: corsHeaders }
						)
					};
				}

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

				// Defense-in-depth qualification gate: discipline + experience +
				// rate, mirroring the listing post-filter and the matching engine.
				const disciplines = await tx
					.select({
						disciplineId: candidateDisciplineExperienceTable.disciplineId,
						experienceLevelOrder: experienceLevelTable.order,
						preferredHourlyMin: candidateDisciplineExperienceTable.preferredHourlyMin,
						preferredHourlyMax: candidateDisciplineExperienceTable.preferredHourlyMax
					})
					.from(candidateDisciplineExperienceTable)
					.leftJoin(
						experienceLevelTable,
						eq(experienceLevelTable.id, candidateDisciplineExperienceTable.experienceLevelId)
					)
					.where(eq(candidateDisciplineExperienceTable.candidateId, candidateProfile.id));

				const qualification = checkCandidateQualified(disciplines, {
					disciplineId: recurrenceDay.requisition.disciplineId,
					experienceLevelOrder: recurrenceDay.experienceLevelOrder,
					hourlyRate: recurrenceDay.requisition.hourlyRate
				});
				if (!qualification.qualified) {
					return {
						kind: 'response',
						response: json(
							{
								success: false,
								message: qualification.message,
								reason: qualification.reason
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

				// Timesheet CREATION stays owned by the processTimesheetCreation cron
				// job (single source of week-boundary truth). But if the candidate
				// already has an OPEN timesheet for this requisition+week, attach this
				// workday now so it can't fragment into a separate timesheet. No-op
				// when no open timesheet exists yet — the cron will create one.
				await linkWorkdayToOpenTimesheet(tx, {
					workdayId: newWorkday.id,
					candidateId: candidateProfile.id,
					requisitionId: recurrenceDay.requisition.id,
					dayStart: recurrenceDay.recurrenceDay.dayStart,
					referenceTimezone: recurrenceDay.requisition.referenceTimezone
				});

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
		logger.error('applyForTempRequisition failed', { error: err });
		return json(
			{ success: false, message: 'Internal server error' },
			{
				status: 500,
				headers: corsHeaders
			}
		);
	}
};
