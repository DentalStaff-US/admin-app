/**
 * When a shift stops being editable schedule and becomes a record of what happened.
 *
 * Once a recurrence day's start time has passed it is the archive of record: hours
 * accrue against it, a timesheet is built from it, and an invoice and wage payout
 * may follow. Removing it (delete, cancel, unassign, reassign, reopen) strands
 * those downstream rows — a client deleting a paid past shift is exactly how prod
 * records drifted. Corrections to a past shift go through the timesheet
 * (discrepancy / void), not the shift.
 *
 * Kept free of imports so it can be tested directly; `shiftLock.ts` holds the
 * database-backed assertions.
 */

/** Timesheet states that are settled billing records — never rewritten. */
export const FROZEN_TIMESHEET_STATUSES = ['APPROVED', 'VOID', 'REJECTED'] as const;

export class ShiftLockedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ShiftLockedError';
	}
}

/** True once the shift has started. A day with no start time is never locked. */
export function isShiftLocked(
	dayStart: Date | string | null | undefined,
	now: Date = new Date()
): boolean {
	if (!dayStart) return false;
	const start = dayStart instanceof Date ? dayStart : new Date(dayStart);
	if (Number.isNaN(start.getTime())) return false;
	return start.getTime() <= now.getTime();
}

/**
 * Editing a past shift's times is a correction, allowed until the timesheet the
 * hours landed on is settled (or wages have gone out). A future shift is always
 * editable.
 */
export function canEditShift(
	shift: {
		dayStart: Date | string | null | undefined;
		timesheetStatus?: string | null;
		wagesStatus?: string | null;
		invoiced?: boolean;
	},
	now: Date = new Date()
): boolean {
	if (!isShiftLocked(shift.dayStart, now)) return true;
	if (shift.invoiced) return false;
	if (shift.wagesStatus === 'WAGES_PAID') return false;
	return !(FROZEN_TIMESHEET_STATUSES as readonly string[]).includes(shift.timesheetStatus ?? '');
}

/** User-facing message for a removal attempted on started shifts. */
export function shiftLockedMessage(dates: string[], verb: string): string {
	const list = dates.length ? ` (${dates.join(', ')})` : '';
	const subject = dates.length > 1 ? 'These shifts have' : 'This shift has';
	return `${subject} already started${list} and can't be ${verb} — past shifts are a record of what happened. Correct the hours on the timesheet instead.`;
}

/** The ShiftLockedError message if `err` is one, otherwise null. For route catch blocks. */
export function shiftLockedErrorMessage(err: unknown): string | null {
	return err instanceof ShiftLockedError ? err.message : null;
}
