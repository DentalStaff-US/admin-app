/**
 * Single source of truth for an admin/client cancellation of one recurrence day.
 *
 * This used to live inline in the workday detail route while the requisition
 * page's bulk cancel did a cut-down version of the same thing — it flipped the
 * status and stamped `cancelledAt` but skipped the audit row, the timesheet
 * strip and the orphan-sheet sweep. That meant a shift cancelled from the
 * workdays table kept billable hours in `hours_raw` (where they also read as an
 * UNAUTHORIZED_WORKDAY discrepancy) and left no cancellation record.
 *
 * Every cancel path now funnels through here so the behaviour can't drift again.
 */

import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import {
	recurrenceDayTable,
	workdayTable,
	type RecurrenceDaySelect,
	type WorkdaySelect
} from '$lib/server/database/schemas/requisition';
import {
	maybeCleanupOrphanTimesheet,
	recordRecurrenceDayCancellation,
	stripWorkdayFromTimesheet,
	type CancellationRole
} from '$lib/server/cancellations';
import { notifyWorkdayDeleted } from '$lib/server/notifications/transactional';

export interface CancelRecurrenceDayArgs {
	recurrenceDayId: string;
	actorUserId: string;
	actorRole: CancellationRole;
}

export interface CancelRecurrenceDaySnapshot {
	recurrenceDay: RecurrenceDaySelect | null;
	workday: WorkdaySelect | null;
}

/**
 * The transactional half of a cancel. Exported separately so callers cancelling
 * several days can run them all in one transaction; `notifyCancelledWorkday`
 * must then be called per snapshot AFTER that transaction commits.
 */
export async function cancelRecurrenceDayInTx(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any,
	args: CancelRecurrenceDayArgs
): Promise<CancelRecurrenceDaySnapshot> {
	// Capture the assigned candidate (if any) and the recurrence day times
	// BEFORE we change anything, so the candidate-side notification has the
	// data it needs.
	const recurrenceDay = await tx
		.select()
		.from(recurrenceDayTable)
		.where(eq(recurrenceDayTable.id, args.recurrenceDayId))
		.limit(1)
		.then((rows: RecurrenceDaySelect[]) => rows[0]);

	const workday = await tx
		.select()
		.from(workdayTable)
		.where(eq(workdayTable.recurrenceDayId, args.recurrenceDayId))
		.limit(1)
		.then((rows: WorkdaySelect[]) => rows[0]);

	await tx
		.update(recurrenceDayTable)
		.set({ status: 'CANCELED', updatedAt: new Date() })
		.where(eq(recurrenceDayTable.id, args.recurrenceDayId));

	// Keep the workday row around (don't delete it). Marking it cancelled lets
	// the candidate calendar surface the cancelled shift, while timesheet reads
	// filter on `cancelledAt IS NULL` so the cancelled day won't count toward
	// hours.
	if (workday) {
		await tx
			.update(workdayTable)
			.set({ cancelledAt: new Date(), updatedAt: new Date() })
			.where(eq(workdayTable.id, workday.id));

		// Strip the cancelled day's hours from the sheet so they don't linger in
		// hours_raw (where they'd otherwise read as an UNAUTHORIZED_WORKDAY
		// discrepancy) and don't bill.
		await stripWorkdayFromTimesheet(tx, {
			timesheetId: workday.timesheetId,
			workdayId: workday.id,
			date: recurrenceDay?.date
		});
	}

	// Audit row. Records WHO cancelled and WHEN, plus a snapshot of shift start
	// + hours-before-shift for future penalty rules.
	await recordRecurrenceDayCancellation(tx, {
		recurrenceDayId: args.recurrenceDayId,
		requisitionId: recurrenceDay?.requisitionId ?? workday?.requisitionId ?? 0,
		cancelledByUserId: args.actorUserId,
		cancelledByRole: args.actorRole,
		candidateId: workday?.candidateId ?? null
	});

	// If this cancellation lands on Sunday (the last day of the Mon→Sun work
	// week) and the timesheet has no other active workdays attached, sweep the
	// now-empty DRAFT timesheet.
	if (workday?.timesheetId && recurrenceDay?.date) {
		await maybeCleanupOrphanTimesheet(tx, {
			timesheetId: workday.timesheetId,
			recurrenceDate: recurrenceDay.date
		});
	}

	return { recurrenceDay: recurrenceDay ?? null, workday: workday ?? null };
}

/**
 * Tell the candidate their shift was cancelled. Call only after the cancelling
 * transaction has committed — the dispatcher swallows its own failures, so a
 * notification problem must not roll back the cancel.
 */
export async function notifyCancelledWorkday(snapshot: CancelRecurrenceDaySnapshot): Promise<void> {
	if (!snapshot.workday || !snapshot.recurrenceDay) return;

	await notifyWorkdayDeleted({
		candidateId: snapshot.workday.candidateId,
		requisitionId: snapshot.workday.requisitionId,
		recurrenceDay: {
			date: snapshot.recurrenceDay.date,
			dayStart: snapshot.recurrenceDay.dayStart,
			dayEnd: snapshot.recurrenceDay.dayEnd
		}
	});
}

/**
 * Cancel a single recurrence day end to end: transaction + notification.
 */
export async function cancelRecurrenceDayAsActor(
	args: CancelRecurrenceDayArgs
): Promise<CancelRecurrenceDaySnapshot> {
	const snapshot = await db.transaction(async (tx) => cancelRecurrenceDayInTx(tx, args));
	await notifyCancelledWorkday(snapshot);
	return snapshot;
}
