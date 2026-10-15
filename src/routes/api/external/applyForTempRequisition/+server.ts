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
import { disciplineTable, experienceLevelTable } from '$lib/server/database/schemas/skill';
import { credentialSelectFields } from '$lib/server/certifications/credentialGateSql';
import { authenticateUser } from '$lib/server/serverUtils';
import { recordAction } from '$lib/server/audit/audit';
import { and, eq } from 'drizzle-orm';
import { CANDIDATE_APP_DOMAIN } from '$env/static/private';
import { notifyWorkdayClaimed } from '$lib/server/notifications/transactional';
import { checkCandidateQualified } from '$lib/server/qualifyCandidate';
import { checkCandidateAvailableOnDates } from '$lib/server/availability/queries';
import { wantsTempWork } from '$lib/server/workPreference';
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
		// The professional deliberately claiming a shift on a day they marked off is
		// their own override, so it is permitted — but only when they said so. Hidden
		// is not the same as forbidden: the board's "Show them anyway" affordance
		// would be a lie otherwise, and it is symmetric with the warn-don't-hide rule
		// the admin side follows. A genuine double-booking is NOT overridable; see below.
		const acknowledgeUnavailable = body.acknowledgeUnavailable === true;

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

				// Defense-in-depth qualification gate: discipline + certification +
				// experience + rate, mirroring the listing post-filter and the
				// matching engine.
				const disciplines = await tx
					.select({
						disciplineId: candidateDisciplineExperienceTable.disciplineId,
						experienceLevelOrder: experienceLevelTable.order,
						preferredHourlyMin: candidateDisciplineExperienceTable.preferredHourlyMin,
						preferredHourlyMax: candidateDisciplineExperienceTable.preferredHourlyMax,
						...credentialSelectFields()
					})
					.from(candidateDisciplineExperienceTable)
					.leftJoin(
						experienceLevelTable,
						eq(experienceLevelTable.id, candidateDisciplineExperienceTable.experienceLevelId)
					)
					.innerJoin(
						disciplineTable,
						eq(disciplineTable.id, candidateDisciplineExperienceTable.disciplineId)
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

				// Work-type preference gate. Unlike the availability gate below there is
				// NO override: availability is a per-date judgement an admin or the
				// professional may knowingly set aside, whereas this is one setting the
				// professional can flip themselves in a single tap. Offering an
				// "anyway" path would be more confusing than the fix.
				if (!wantsTempWork(candidateProfile.workPreference)) {
					return {
						kind: 'response',
						response: json(
							{
								success: false,
								message:
									'Your profile is set to permanent positions only. Update it in Settings → Edit Profile to claim temporary shifts.',
								reason: 'workPreference'
							},
							{ status: 409, headers: corsHeaders }
						)
					};
				}

				// Availability gate. A sibling of checkCandidateQualified rather than part
				// of it — see $lib/server/availability/availability.ts for why.
				//
				// Reaching this endpoint on a blocked day means a stale page, a deep
				// link, the "Show them anyway" affordance, or an SMS sent before the
				// blackout existed. Two different answers:
				//
				//   'booked' — they already work a different shift that calendar day.
				//     HARD block, no override. This also closes a pre-existing hole: the
				//     listing endpoints filtered same-day bookings but this endpoint only
				//     ever checked for a workday on the SAME recurrence day, so two
				//     browser tabs could double-book a date.
				//
				//   'blackout' / 'weekday' — their own stated preference, which they may
				//     knowingly override by resending with acknowledgeUnavailable.
				const availability = await checkCandidateAvailableOnDates(
					candidateProfile.id,
					[recurrenceDay.recurrenceDay.date],
					{ considerBooked: true, tx }
				);
				if (!availability.available) {
					const blocked = availability.blocked[0];
					const overridable = blocked.reason !== 'booked';
					if (!overridable || !acknowledgeUnavailable) {
						return {
							kind: 'response',
							response: json(
								{
									success: false,
									message: blocked.message,
									reason: 'availability',
									blockedReason: blocked.reason,
									// Lets the client offer "claim anyway" instead of a dead end.
									overridable
								},
								// 409, not 403: a self-inflicted, self-clearable conflict. The
								// candidate app offers "update your availability", not
								// "contact support".
								{ status: 409, headers: corsHeaders }
							)
						};
					}
				}
				const overroteAvailability = !availability.available;

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

				const shiftStart = recurrenceDay.recurrenceDay.dayStart as Date;
				await recordAction({
					tx,
					entityType: 'RECURRENCE_DAYS',
					entityId: recurrenceDayId,
					action: 'CLAIM',
					actor: user,
					before: { status: recurrenceDay.recurrenceDay.status },
					after: { status: 'FILLED' },
					metadata: {
						requisitionId: recurrenceDay.requisition.id,
						candidateId: candidateProfile.id,
						workdayId: newWorkday.id,
						shiftStart: shiftStart?.toISOString?.() ?? null,
						hoursBeforeShift: shiftStart
							? Number(((shiftStart.getTime() - Date.now()) / 3_600_000).toFixed(2))
							: null,
						// They claimed a day they had marked unavailable, knowingly. Recorded
						// so the ledger explains why an apparently-blocked day got claimed.
						claimedDespiteUnavailable: overroteAvailability
							? availability.blocked.map((b) => ({ date: b.date, reason: b.reason }))
							: undefined
					}
				});

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
