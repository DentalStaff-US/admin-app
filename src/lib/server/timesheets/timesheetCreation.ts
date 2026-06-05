import db from '$lib/server/database/drizzle';
import {
	workdayTable,
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { notifyTimesheetCreated } from '$lib/server/notifications/transactional';
import { logger } from '$lib/server/logger';
import { computeWeekBeginDate } from '$lib/server/database/queries/requisitions';

/**
 * Self-heal: release any workday still attached to a VOID timesheet. A
 * correctly-voided timesheet detaches its workdays, but a void done before that
 * logic existed (or any future regression) can leave the link dangling — which
 * would keep those workdays out of regeneration forever. Nulling timesheetId
 * lets the eligibility scan pick them up and build a fresh DRAFT. Returns the
 * number of workdays released.
 */
export async function releaseVoidOrphanedWorkdays(): Promise<number> {
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
	return released.length;
}

/**
 * Every workday not yet linked to a timesheet and not cancelled. We intentionally
 * do NOT filter on dayStart: a timesheet covers the whole Mon–Sun week, so once
 * the week has started (checked in {@link groupWorkdaysByWeek}) we want EVERY day
 * in it — including future-dated days like a Thu/Fri shift viewed on Wed — to
 * land on the one timesheet.
 */
export function findUnlinkedWorkdays() {
	return db
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
		.where(and(isNull(workdayTable.timesheetId), isNull(workdayTable.cancelledAt)));
}

export type UnlinkedWorkdayRow = Awaited<ReturnType<typeof findUnlinkedWorkdays>>[number];

export type WeekGroup = {
	candidateId: string;
	requisitionId: number;
	weekBeginDate: string;
	clientId: string;
	workdayIds: string[];
};

/**
 * Group unlinked workdays by candidate+requisition+week (Monday in the
 * requisition's timezone). Skips weeks that haven't begun yet — a future week's
 * days shouldn't spin up a timesheet early; they're picked up once that week's
 * Monday passes.
 */
export async function groupWorkdaysByWeek(
	rows: UnlinkedWorkdayRow[],
	now: Date
): Promise<WeekGroup[]> {
	const groups = new Map<string, WeekGroup>();

	for (const row of rows) {
		const weekBeginDate = computeWeekBeginDate(
			row.recurrenceDay.dayStart,
			row.requisition.referenceTimezone
		);

		// Only act on weeks that have already begun (Mon 00:00 of the week vs now).
		if (new Date(`${weekBeginDate}T00:00:00Z`) > now) continue;

		const key = `${row.workday.candidateId}::${row.workday.requisitionId}::${weekBeginDate}`;

		if (!groups.has(key)) {
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

	return [...groups.values()];
}

/**
 * For each week group, reuse the candidate's OPEN timesheet (DRAFT/PENDING/
 * DISCREPANCY) for that week or create a fresh DRAFT, then link all of the
 * group's workdays to it. Terminal sheets (APPROVED/VOID/REJECTED) are excluded
 * from reuse, so a backfilled day in an already-billed week forms a new DRAFT.
 * A PENDING sheet that gains a new day is reopened to DRAFT. Notifies the
 * candidate after commit when a sheet was created or reopened.
 */
export async function attachWeeksToTimesheets(
	groups: WeekGroup[]
): Promise<{ created: number; linked: number }> {
	let created = 0;
	let linked = 0;

	for (const group of groups) {
		const outcome = await db.transaction(async (tx) => {
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
				// A new workday joined an already-submitted sheet — reopen it so the
				// added day's hours get entered before re-submission.
				if (existing.status === 'PENDING') {
					await tx
						.update(timeSheetTable)
						.set({ status: 'DRAFT', updatedAt: new Date() })
						.where(eq(timeSheetTable.id, existing.id));
					reopenedPending = true;
				}
			}

			for (const workdayId of group.workdayIds) {
				await tx
					.update(workdayTable)
					.set({ timesheetId, updatedAt: new Date() })
					.where(eq(workdayTable.id, workdayId));
				linked++;
			}

			return { didCreate, reopenedPending };
		});

		// Fire after the transaction commits so email/SMS doesn't go out on a rollback.
		if (outcome.didCreate || outcome.reopenedPending) {
			await notifyTimesheetCreated({
				candidateId: group.candidateId,
				requisitionId: group.requisitionId
			});
		}
	}

	return { created, linked };
}
