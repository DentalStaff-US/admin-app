/**
 * When a shift becomes a record that can no longer be changed directly.
 *
 * Once a shift has started it locks if either:
 *   - PAID: a timesheet covering it is APPROVED with wages PAID — the record of
 *     what was worked and paid (a client deleting a paid past shift is how prod
 *     records drifted); or
 *   - INVOICED: its timesheet has a live (non-void) invoice — changing the shift
 *     would leave the invoice billing the old hours. Amend it through "Void
 *     Timesheet & Invoice", which releases the shift and regenerates both.
 * Locked shifts refuse every action — edit, cancel, delete, unassign, reassign,
 * reopen. Until then, past or future, everything is allowed.
 *
 * Kept free of imports so it can be tested directly; `shiftLock.ts` holds the
 * database-backed assertions.
 */

export class ShiftLockedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ShiftLockedError';
	}
}

/** True once the shift's start has passed. A day with no start time never has. */
export function hasShiftStarted(
	dayStart: Date | string | null | undefined,
	now: Date = new Date()
): boolean {
	if (!dayStart) return false;
	const start = dayStart instanceof Date ? dayStart : new Date(dayStart);
	if (Number.isNaN(start.getTime())) return false;
	return start.getTime() <= now.getTime();
}

/** Approved and paid out. */
export function isTimesheetPaidOut(t: {
	status?: string | null;
	wagesStatus?: string | null;
}): boolean {
	return t.status === 'APPROVED' && t.wagesStatus === 'WAGES_PAID';
}

export type ShiftLockReason = 'PAID' | 'INVOICED';

/** Why a shift is locked, or null if it can still be changed. PAID wins over INVOICED. */
export function shiftLockReason(
	shift: {
		dayStart: Date | string | null | undefined;
		timesheetStatus?: string | null;
		wagesStatus?: string | null;
		invoiced?: boolean;
	},
	now: Date = new Date()
): ShiftLockReason | null {
	if (!hasShiftStarted(shift.dayStart, now)) return null;
	if (isTimesheetPaidOut({ status: shift.timesheetStatus, wagesStatus: shift.wagesStatus })) {
		return 'PAID';
	}
	return shift.invoiced ? 'INVOICED' : null;
}

/** User-facing message for an action attempted on locked shifts. */
export function shiftLockedMessage(
	dates: string[],
	verb: string,
	reason: ShiftLockReason = 'PAID'
): string {
	const list = dates.length ? ` (${dates.join(', ')})` : '';
	const many = dates.length > 1;
	if (reason === 'INVOICED') {
		return `${many ? 'These shifts are' : 'This shift is'} on an invoice${list} and can't be ${verb} directly — use "Void Timesheet & Invoice" on the timesheet first, then correct the shift.`;
	}
	return `${many ? 'These shifts have' : 'This shift has'} been worked, approved and paid${list} and can't be ${verb} — it's the record of what happened.`;
}

/** The ShiftLockedError message if `err` is one, otherwise null. For route catch blocks. */
export function shiftLockedErrorMessage(err: unknown): string | null {
	return err instanceof ShiftLockedError ? err.message : null;
}
