/**
 * One rule for "is this shift actually assigned?", shared by every surface that
 * renders a professional against a recurrence day.
 *
 * A workday row outliving its assignment is normal, not corruption. Cancelling a
 * shift keeps the row with `cancelledAt` set so the history survives, and
 * `addCandidateToBlacklist` goes further: it soft-cancels the workday and flips
 * the day back to OPEN so the client can refill it. The row is retained
 * deliberately in both cases.
 *
 * So presence of a workday row does NOT mean the day is filled. Reading it that
 * way is what made genuinely OPEN shifts render with a professional still
 * attached. The assignment is active only while `cancelledAt` is null; a
 * cancelled one is history, and is worth showing only on a day that is itself
 * CANCELED — on a reopened day the professional is simply gone.
 */

/** The subset of a workday row this rule needs. */
export type AssignmentState = {
	cancelledAt: Date | string | null | undefined;
};

/** True when someone is currently on this shift. */
export function isAssignmentActive(assignment: AssignmentState | null | undefined): boolean {
	return Boolean(assignment) && !assignment?.cancelledAt;
}

/**
 * True when the assignment is over but still worth showing as context — i.e. the
 * day itself was cancelled, so "who lost this shift" is the useful answer.
 * A reopened (OPEN/UNFULFILLED) day returns false: that shift has no one on it.
 */
export function isAssignmentHistory(
	assignment: AssignmentState | null | undefined,
	dayStatus: string | null | undefined
): boolean {
	return Boolean(assignment?.cancelledAt) && dayStatus === 'CANCELED';
}

/**
 * Should this surface render a professional at all — either as the current
 * assignee or as history?
 */
export function shouldShowProfessional(
	assignment: AssignmentState | null | undefined,
	dayStatus: string | null | undefined
): boolean {
	return isAssignmentActive(assignment) || isAssignmentHistory(assignment, dayStatus);
}
