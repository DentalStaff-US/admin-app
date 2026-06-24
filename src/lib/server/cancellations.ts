/**
 * Recurrence-day cancellation shared utilities.
 *
 * Both the admin/client cancel handler and the candidate cancel handler write
 * a row to `recurrence_day_cancellations` so we have a single audit trail
 * regardless of who cancelled or whether the workday row is kept (admin
 * path) or deleted (candidate path).
 *
 * Also handles the empty-timesheet cleanup: when a cancellation lands on
 * Sunday (the last day of the Mon→Sun work week) and leaves a timesheet
 * with zero remaining active workdays, the now-orphaned DRAFT timesheet is
 * removed. Mid-week cancellations leave the timesheet in place — more days
 * may still be added before the week closes out.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
	recurrenceDayCancellationTable,
	recurrenceDayTable,
	timeSheetTable,
	workdayTable,
	type RawTimesheetHours
} from '$lib/server/database/schemas/requisition';

export type CancellationRole = 'SUPERADMIN' | 'CLIENT' | 'CLIENT_STAFF' | 'CANDIDATE';

interface RecordCancellationArgs {
	recurrenceDayId: string;
	requisitionId: number;
	cancelledByUserId: string;
	cancelledByRole: CancellationRole;
	/**
	 * The candidate who lost (or gave up) the shift, if any. Pass the assigned
	 * candidate for admin/client cancels; the candidate themself for candidate
	 * cancels; omit if the shift was never claimed.
	 */
	candidateId?: string | null;
	reason?: string | null;
}

/**
 * Insert a cancellation row, snapshotting the recurrence day's shift start and
 * the gap from cancel time to shift time so penalty rules later can reason on
 * data that won't drift.
 *
 * Pass `tx` so the audit row commits/rolls back with the rest of the cancel
 * transaction.
 */
export async function recordRecurrenceDayCancellation(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any,
	args: RecordCancellationArgs
): Promise<void> {
	const [recurrenceDay] = await tx
		.select({ dayStart: recurrenceDayTable.dayStart })
		.from(recurrenceDayTable)
		.where(eq(recurrenceDayTable.id, args.recurrenceDayId))
		.limit(1);

	if (!recurrenceDay) {
		// Recurrence day's gone — nothing meaningful to log against. Caller
		// has the workday id; we just skip the audit row rather than throw.
		return;
	}

	const shiftStart = recurrenceDay.dayStart as Date;
	const now = new Date();
	const msUntilShift = shiftStart.getTime() - now.getTime();
	const hoursBeforeShift = (msUntilShift / (1000 * 60 * 60)).toFixed(2);

	await tx.insert(recurrenceDayCancellationTable).values({
		id: crypto.randomUUID(),
		createdAt: now,
		recurrenceDayId: args.recurrenceDayId,
		requisitionId: args.requisitionId,
		cancelledByUserId: args.cancelledByUserId,
		cancelledByRole: args.cancelledByRole,
		candidateId: args.candidateId ?? null,
		shiftStart,
		hoursBeforeShift,
		reason: args.reason ?? null
	});
}

interface MaybeCleanupArgs {
	timesheetId: string | null | undefined;
	/** The cancelled recurrence day's `date` field, as YYYY-MM-DD. */
	recurrenceDate: string | null | undefined;
}

/**
 * If the cancelled date is the last day of its work week (Sunday in Mon→Sun)
 * and the timesheet has no remaining non-cancelled workdays linked to it,
 * delete the DRAFT timesheet so we don't leave an orphan around.
 *
 * Mid-week cancellations are a no-op even if they leave the timesheet
 * temporarily empty — more workdays may attach before week's end.
 */
export async function maybeCleanupOrphanTimesheet(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any,
	args: MaybeCleanupArgs
): Promise<boolean> {
	if (!args.timesheetId || !args.recurrenceDate) return false;

	// Parse YYYY-MM-DD as a UTC date and check the day-of-week. 0 = Sunday.
	// All recurrence_day.date values are stored as naive YYYY-MM-DD strings,
	// so parsing them as UTC keeps the day-of-week stable across viewer zones.
	const parsed = new Date(`${args.recurrenceDate}T00:00:00Z`);
	if (parsed.getUTCDay() !== 0) {
		return false;
	}

	const remaining = await tx
		.select({ id: workdayTable.id })
		.from(workdayTable)
		.where(and(eq(workdayTable.timesheetId, args.timesheetId), isNull(workdayTable.cancelledAt)))
		.limit(1);

	if (remaining.length > 0) {
		return false;
	}

	const deleted = await tx
		.delete(timeSheetTable)
		.where(and(eq(timeSheetTable.id, args.timesheetId), eq(timeSheetTable.status, 'DRAFT')))
		.returning({ id: timeSheetTable.id });

	return deleted.length > 0;
}

/**
 * Remove a single workday's entry from a timesheet's `hours_raw` JSON and
 * recompute `totalHoursWorked`. This is what lets a day be unassigned/cancelled
 * WITHOUT deleting the whole timesheet to drop it — the historical workaround
 * that stranded other days' hours.
 *
 * Matches the entry by `workdayId` (the stable key). For legacy entries written
 * before `workdayId` existed, falls back to a date match when the caller passes
 * the removed day's `date`. Returns true if an entry was actually stripped.
 *
 * Pass `tx` so the rewrite commits/rolls back with the rest of the removal.
 */
export async function stripWorkdayFromTimesheet(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any,
	args: { timesheetId: string | null | undefined; workdayId: string; date?: string | null }
): Promise<boolean> {
	if (!args.timesheetId) return false;

	const [sheet] = await tx
		.select({ id: timeSheetTable.id, hoursRaw: timeSheetTable.hoursRaw })
		.from(timeSheetTable)
		.where(eq(timeSheetTable.id, args.timesheetId))
		.limit(1);
	if (!sheet) return false;

	const hoursRaw = (sheet.hoursRaw ?? []) as RawTimesheetHours[];
	const filtered = hoursRaw.filter((entry) => {
		if (entry.workdayId) return entry.workdayId !== args.workdayId;
		// Legacy entry with no workdayId: drop only on an explicit date match.
		return args.date ? entry.date !== args.date : true;
	});

	if (filtered.length === hoursRaw.length) return false; // nothing to strip

	const totalHoursWorked = filtered
		.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0)
		.toString();

	await tx
		.update(timeSheetTable)
		.set({ hoursRaw: filtered, totalHoursWorked, updatedAt: new Date() })
		.where(eq(timeSheetTable.id, args.timesheetId));

	return true;
}

/**
 * Drizzle `where` fragment for "active (non-cancelled) workday". Reuse this
 * whenever loading workdays for a timesheet so cancelled rows are filtered
 * out of hour calculations and submission UIs.
 */
export const isActiveWorkdayCondition = sql`${workdayTable.cancelledAt} is null`;
