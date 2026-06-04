import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	workdayTable,
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import { and, eq, isNull, lte, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { CRON_SECRET } from '$env/static/private';
import { toZonedTime } from 'date-fns-tz';
import { notifyTimesheetCreated } from '$lib/server/notifications/transactional';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { tryWithAdvisoryLock } from '$lib/server/jobs/withAdvisoryLock';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processTimesheetCreation', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}

	const result = await tryWithAdvisoryLock('processTimesheetCreation', async () => {
		try {
			const now = new Date();

			// Self-heal: release any workdays still attached to a VOID timesheet.
			// A correctly-voided timesheet detaches its workdays, but a void done
			// before that logic existed (or any future regression) can leave the
			// link dangling — which would keep those workdays out of regeneration
			// forever. Nulling timesheetId here lets the eligibility query below
			// pick them up and build a fresh DRAFT.
			const released = await db
				.update(workdayTable)
				.set({ timesheetId: null, updatedAt: new Date() })
				.where(
					and(
						isNull(workdayTable.cancelledAt),
						inArray(
							workdayTable.timesheetId,
							db
								.select({ id: timeSheetTable.id })
								.from(timeSheetTable)
								.where(eq(timeSheetTable.status, 'VOID'))
						)
					)
				)
				.returning({ id: workdayTable.id });
			if (released.length > 0) {
				logger.event?.('timesheet_cron_released_voided_workdays', { count: released.length });
			}

			// Find all workdays where:
			// - timesheetId is null (not yet linked)
			// - recurrenceDay.dayStart has passed
			// - the workday hasn't been cancelled (admin/client-cancelled workdays
			//   stay in the table for calendar visibility but must not get a
			//   timesheet created against them)
			const eligibleWorkdays = await db
				.select({
					workday: workdayTable,
					recurrenceDay: recurrenceDayTable,
					requisition: requisitionTable,
					candidateProfile: candidateProfileTable
				})
				.from(workdayTable)
				.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, workdayTable.recurrenceDayId))
				.innerJoin(requisitionTable, eq(requisitionTable.id, workdayTable.requisitionId))
				.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, workdayTable.candidateId))
				.where(
					and(
						isNull(workdayTable.timesheetId),
						isNull(workdayTable.cancelledAt),
						lte(recurrenceDayTable.dayStart, now)
					)
				);

			if (eligibleWorkdays.length === 0) {
				return json({ success: true, noop: true });
			}

			// Group workdays by (candidateId, requisitionId, weekBeginDate)
			// Week begin date is Monday in the requisition's timezone
			const groups = new Map<
				string,
				{
					candidateId: string;
					requisitionId: number;
					weekBeginDate: string;
					clientId: string;
					workdayIds: string[];
				}
			>();

			for (const row of eligibleWorkdays) {
				const tz = row.requisition.referenceTimezone || 'America/New_York';
				const dayStartInTz = toZonedTime(row.recurrenceDay.dayStart, tz);

				// Calculate Monday of this week in the requisition's timezone
				const dayOfWeek = dayStartInTz.getDay(); // 0=Sun, 1=Mon ... 6=Sat
				const diffToMonday = (dayOfWeek + 6) % 7;
				const monday = new Date(dayStartInTz);
				monday.setDate(dayStartInTz.getDate() - diffToMonday);
				const weekBeginDate = monday.toISOString().split('T')[0];

				const key = `${row.workday.candidateId}::${row.workday.requisitionId}::${weekBeginDate}`;

				if (!groups.has(key)) {
					// Get the client company ID from the requisition's company
					const [company] = await db
						.select({ clientId: clientCompanyTable.clientId })
						.from(clientCompanyTable)
						.where(eq(clientCompanyTable.id, row.requisition.companyId))
						.limit(1);

					groups.set(key, {
						candidateId: row.workday.candidateId,
						requisitionId: row.workday.requisitionId,
						weekBeginDate,
						clientId: company?.clientId ?? '',
						workdayIds: []
					});
				}

				groups.get(key)!.workdayIds.push(row.workday.id);
			}

			let created = 0;
			let linked = 0;

			// Process each group
			for (const group of groups.values()) {
				const outcome = await db.transaction(async (tx) => {
					// Only reuse an OPEN timesheet for this week. Terminal sheets
					// (APPROVED, VOID, REJECTED) must NOT absorb new/disconnected
					// workdays — those form a fresh DRAFT instead. This is what lets a
					// voided timesheet's released workdays regenerate correctly.
					const [existing] = await tx
						.select()
						.from(timeSheetTable)
						.where(
							and(
								eq(timeSheetTable.associatedCandidateId, group.candidateId),
								eq(timeSheetTable.requisitionId, group.requisitionId),
								eq(timeSheetTable.weekBeginDate, group.weekBeginDate),
								inArray(timeSheetTable.status, ['DRAFT', 'PENDING', 'DISCREPANCY'])
							)
						)
						.limit(1);

					let timesheetId: string;
					let didCreate = false;
					let reopenedPending = false;

					if (!existing) {
						// Create new timesheet
						timesheetId = crypto.randomUUID();
						await tx.insert(timeSheetTable).values({
							id: timesheetId,
							createdAt: new Date(),
							updatedAt: new Date(),
							associatedCandidateId: group.candidateId,
							associatedClientId: group.clientId,
							requisitionId: group.requisitionId,
							weekBeginDate: group.weekBeginDate,
							totalHoursWorked: '0',
							totalHoursBilled: '0',
							hoursRaw: [],
							status: 'DRAFT',
							validated: false,
							awaitingClientSignature: true
						});
						didCreate = true;
						created++;
					} else {
						timesheetId = existing.id;
						// A new workday joined an already-submitted sheet — reopen it so
						// the added day's hours get entered before re-submission.
						if (existing.status === 'PENDING') {
							await tx
								.update(timeSheetTable)
								.set({ status: 'DRAFT', updatedAt: new Date() })
								.where(eq(timeSheetTable.id, existing.id));
							reopenedPending = true;
						}
					}

					// Link all workdays in this group to the timesheet
					for (const workdayId of group.workdayIds) {
						await tx
							.update(workdayTable)
							.set({ timesheetId, updatedAt: new Date() })
							.where(eq(workdayTable.id, workdayId));
						linked++;
					}

					return { didCreate, reopenedPending };
				});

				// Notify the candidate when there's a fresh sheet to fill out, or when
				// we reopened a submitted one because a new day was added. Fire after
				// the transaction commits so email/SMS doesn't go out on a rollback.
				if (outcome.didCreate || outcome.reopenedPending) {
					await notifyTimesheetCreated({
						candidateId: group.candidateId,
						requisitionId: group.requisitionId
					});
				}
			}

			// "Noop" from a notifications-emitted standpoint: we only fire
			// notifyTimesheetCreated when a NEW timesheet is created. If we only
			// linked workdays onto an existing draft, no notification went out.
			return json({
				success: true,
				message: `Processed ${groups.size} groups`,
				created,
				linked,
				noop: created === 0
			});
		} catch (error) {
			logger.error('processTimesheetCreation job failed', { error });
			return json({ success: false, error: String(error) }, { status: 500 });
		}
	});

	if (result === null) {
		return json({
			success: true,
			skipped: true,
			message: 'processTimesheetCreation is already running; skipping this tick'
		});
	}
	return result;
};
