/**
 * Database-backed guards for the shift-lock rule (see `shiftLockRule.ts`).
 *
 * Every removal of a recurrence day or its workday — delete, cancel, unassign,
 * reassign, reopen-to-OPEN, candidate cancel — calls `assertRecurrenceDaysUnlocked`
 * before writing, inside the same transaction, so no route can strand a past
 * shift's timesheet, invoice or payout.
 */

import db from '$lib/server/database/drizzle';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
	invoiceTable,
	recurrenceDayTable,
	timeSheetTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import {
	canEditShift,
	isShiftLocked,
	shiftLockedMessage,
	ShiftLockedError
} from '$lib/server/requisitions/shiftLockRule';

export { ShiftLockedError, shiftLockedErrorMessage } from '$lib/server/requisitions/shiftLockRule';

/**
 * Throws ShiftLockedError if any of the given recurrence days has started.
 * `verb` completes "can't be ___" in the message (e.g. 'deleted', 'cancelled').
 */
export async function assertRecurrenceDaysUnlocked(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	exec: any,
	recurrenceDayIds: string[],
	verb: string
): Promise<void> {
	if (recurrenceDayIds.length === 0) return;
	const rows: { date: string; dayStart: Date | null }[] = await (exec ?? db)
		.select({ date: recurrenceDayTable.date, dayStart: recurrenceDayTable.dayStart })
		.from(recurrenceDayTable)
		.where(inArray(recurrenceDayTable.id, recurrenceDayIds));

	const locked = rows.filter((r) => isShiftLocked(r.dayStart)).map((r) => r.date);
	if (locked.length > 0) {
		throw new ShiftLockedError(shiftLockedMessage(locked.sort(), verb));
	}
}

/**
 * Throws ShiftLockedError if a past shift's times can no longer be edited because
 * the timesheet its hours landed on is settled, invoiced or paid out.
 */
export async function assertRecurrenceDayEditable(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	exec: any,
	recurrenceDayId: string
): Promise<void> {
	const [row] = await (exec ?? db)
		.select({
			date: recurrenceDayTable.date,
			dayStart: recurrenceDayTable.dayStart,
			timesheetStatus: timeSheetTable.status,
			wagesStatus: timeSheetTable.wagesStatus,
			invoiceId: invoiceTable.id
		})
		.from(recurrenceDayTable)
		.leftJoin(
			workdayTable,
			and(eq(workdayTable.recurrenceDayId, recurrenceDayTable.id), isNull(workdayTable.cancelledAt))
		)
		.leftJoin(timeSheetTable, eq(timeSheetTable.id, workdayTable.timesheetId))
		.leftJoin(invoiceTable, eq(invoiceTable.timesheetId, timeSheetTable.id))
		.where(eq(recurrenceDayTable.id, recurrenceDayId))
		.limit(1);

	if (!row) return;
	const editable = canEditShift({
		dayStart: row.dayStart,
		timesheetStatus: row.timesheetStatus,
		wagesStatus: row.wagesStatus,
		invoiced: !!row.invoiceId
	});
	if (!editable) {
		throw new ShiftLockedError(
			`The shift on ${row.date} has already been approved, invoiced or paid and can't be edited. Correct it on the timesheet instead.`
		);
	}
}
