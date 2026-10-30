/**
 * Database-backed guards for the shift-lock rule (see `shiftLockRule.ts`).
 *
 * Every change to a recurrence day or its workday — edit, delete, cancel,
 * unassign, reassign, reopen, candidate cancel — calls one of these before
 * writing, inside the same transaction where there is one, so no route can
 * rewrite a shift that has been paid out or is on a live invoice.
 */

import db from '$lib/server/database/drizzle';
import { and, eq, inArray, ne } from 'drizzle-orm';
import {
	invoiceTable,
	recurrenceDayTable,
	timeSheetTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import {
	shiftLockReason,
	shiftLockedMessage,
	ShiftLockedError
} from '$lib/server/requisitions/shiftLockRule';

export { ShiftLockedError, shiftLockedErrorMessage } from '$lib/server/requisitions/shiftLockRule';

/**
 * Throws ShiftLockedError if any of the given recurrence days has started and has a
 * workday on an APPROVED, WAGES_PAID timesheet or on a timesheet with a live
 * invoice. Cancelled workdays count too: their hours may still be on the sheet.
 * `verb` completes "can't be ___" in the message (e.g. 'deleted', 'cancelled').
 */
export async function assertRecurrenceDaysUnlocked(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	exec: any,
	recurrenceDayIds: string[],
	verb: string
): Promise<void> {
	if (recurrenceDayIds.length === 0) return;
	const rows: {
		date: string;
		dayStart: Date | null;
		timesheetStatus: string | null;
		wagesStatus: string | null;
		invoiceId: string | null;
	}[] = await (exec ?? db)
		.select({
			date: recurrenceDayTable.date,
			dayStart: recurrenceDayTable.dayStart,
			timesheetStatus: timeSheetTable.status,
			wagesStatus: timeSheetTable.wagesStatus,
			invoiceId: invoiceTable.id
		})
		.from(recurrenceDayTable)
		.innerJoin(workdayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
		.innerJoin(timeSheetTable, eq(timeSheetTable.id, workdayTable.timesheetId))
		.leftJoin(
			invoiceTable,
			and(eq(invoiceTable.timesheetId, timeSheetTable.id), ne(invoiceTable.status, 'void'))
		)
		.where(inArray(recurrenceDayTable.id, recurrenceDayIds));

	const paid = new Set<string>();
	const invoiced = new Set<string>();
	for (const r of rows) {
		const reason = shiftLockReason({ ...r, invoiced: r.invoiceId !== null });
		if (reason === 'PAID') paid.add(r.date);
		else if (reason === 'INVOICED') invoiced.add(r.date);
	}
	// Paid is final, so report it first; invoiced shifts can be unlocked by voiding.
	if (paid.size > 0) {
		throw new ShiftLockedError(shiftLockedMessage([...paid].sort(), verb, 'PAID'));
	}
	if (invoiced.size > 0) {
		throw new ShiftLockedError(shiftLockedMessage([...invoiced].sort(), verb, 'INVOICED'));
	}
}

/** Same rule for editing a shift's times. */
export async function assertRecurrenceDayEditable(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	exec: any,
	recurrenceDayId: string
): Promise<void> {
	await assertRecurrenceDaysUnlocked(exec, [recurrenceDayId], 'edited');
}
