/**
 * Single definition of "is this professional available on this calendar date?".
 *
 * THE DEFAULT IS AVAILABLE. A professional who has never touched availability is
 * available every day, and so is one with no blackout rows. Inaction must never
 * cost someone work — that inversion is the entire point of the feature, and every
 * function here is written so that missing/empty data means *available*, never
 * *unavailable*.
 *
 * THREE INDEPENDENT REASONS a date can be blocked:
 *
 *   blackout — the professional (or an admin, on their behalf) marked this specific
 *     calendar date in `candidate_unavailable_dates`. The most specific and most
 *     actionable reason, so it wins when several apply.
 *
 *   weekday — the date's day-of-week is outside `candidate_profiles.available_days`.
 *     NULL or empty means NEVER SET, which means all seven days.
 *
 *   booked — the professional already has a live workday on that date, for any
 *     requisition. DERIVED from `workdays`, never stored, and not really an
 *     availability fact at all; it ranks last and is surfaced separately on My Shifts.
 *
 * ENFORCEMENT IS NOT UNIFORM, and that asymmetry is deliberate:
 *   - the professional's own shift board and the new-job SMS/email blast HIDE
 *     blocked days (the blast is the one surface nobody can opt out of)
 *   - admin and client match lists still SHOW the professional, with a per-date
 *     warning badge, and assigning anyway is permitted with a confirm
 * So callers ask this module a question and then apply their own policy. Do not
 * "unify" them.
 *
 * WHY THIS IS NOT PART OF checkCandidateQualified():
 *   1. That function has exactly one policy — "not qualified ⇒ reject". Folding
 *      availability in would force every admin call site to special-case the reason
 *      in order to *un*-reject someone, and the first refactor that treats reasons
 *      uniformly would silently convert warn-don't-hide into hide.
 *   2. It is pure, synchronous and date-agnostic by documented contract so it can
 *      run inside `.filter(...)`. Availability needs a date and an async read.
 *   3. A lapsed license is a compliance fact that must block everywhere; availability
 *      is a stated preference. Same door means someone eventually relaxes both together.
 * Availability is a SIBLING gate with a parallel shape, composed in sequence.
 *
 * WHERE THIS DELIBERATELY DOES NOT APPLY: permanent requisitions. They have no
 * recurrence days and no start date, so there is no date to evaluate; gating a
 * salaried listing on a weekly pattern would mean "you said you don't work Sundays,
 * so you can't see this full-time job." `getOpeningsForCandidate` and
 * `applyForRequisition` are intentionally untouched. This is not an unfinished
 * rollout.
 *
 * Dependency-free (no Drizzle, no $env) so it can be unit-tested and reused freely.
 * ./queries.ts holds the database access, including one raw-SQL mirror of the
 * weekday rule (getUnavailabilityForCandidates, which answers N professionals x M
 * dates in a single statement). That mirror and this file MUST change together.
 */

import { parseISO } from 'date-fns';

/**
 * Upper bound on how many blackout dates one write may carry. A PAYLOAD guard, not
 * a product limit: professionals may block dates arbitrarily far into the future,
 * and a client that needs more than this simply sends more than one window.
 */
export const MAX_BLACKOUT_DATES_PER_REQUEST = 1000;

/** 0 = Sunday … 6 = Saturday. Matches Date.getDay() and Postgres EXTRACT(DOW). */
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
] as const;

export type AvailabilityBlockReason = 'blackout' | 'weekday' | 'booked';

export type AvailabilitySource = 'CANDIDATE' | 'ADMIN';

export type CandidateAvailabilityPattern = {
	/** NULL — and, defensively, [] — means never set, which means all seven days. */
	availableDays: number[] | null;
	/** 'YYYY-MM-DD' dates the professional marked unavailable. */
	blackoutDates: ReadonlySet<string>;
	/** 'YYYY-MM-DD' dates with a live workday. Derived from workdays, never stored. */
	bookedDates: ReadonlySet<string>;
};

export type AvailabilityCheck =
	| { available: true }
	| { available: false; reason: AvailabilityBlockReason; message: string };

export type BlockedDate = {
	date: string;
	reason: AvailabilityBlockReason;
	message: string;
};

/**
 * Does this professional have a weekly pattern they actually chose?
 *
 * Both NULL and [] answer false. [] should be impossible (the CHECK constraint on
 * candidate_profiles.available_days forbids it) but is treated as unset everywhere
 * in this module as defence in depth: one bad row must not be able to hide every
 * shift from a professional with no visible cause.
 */
export function hasCustomWeeklyPattern(days: number[] | null | undefined): boolean {
	return Array.isArray(days) && days.length > 0 && days.length < 7;
}

/**
 * Day of week for a bare 'YYYY-MM-DD', as 0 = Sunday … 6 = Saturday.
 *
 * `parseISO` and NOT `new Date(date)`. Per spec, `new Date('2026-07-04')` parses a
 * date-only string as UTC midnight, and `.getDay()` then reports it in local time —
 * so the answer is off by one everywhere west of UTC, which is all of the US.
 * `parseISO` parses date-only as LOCAL midnight, which makes `.getDay()` correct in
 * every timezone. There is a dedicated test for this.
 */
export function dayOfWeekFromDateString(date: string): number {
	return parseISO(date).getDay();
}

/**
 * Normalize a submitted weekly pattern: sort, dedupe, validate.
 *
 * `null` in ⇒ `null` out (an explicit reset to default-available). `[]` is an error
 * rather than a silent no-op, because "available no days" is not a state this
 * product has — someone who wants to stop getting shifts goes INACTIVE.
 */
export function normalizeAvailableDays(
	input: unknown
): { ok: true; days: number[] | null } | { ok: false; reason: 'EMPTY' | 'INVALID' } {
	if (input === null || input === undefined) return { ok: true, days: null };
	if (!Array.isArray(input)) return { ok: false, reason: 'INVALID' };
	if (input.length === 0) return { ok: false, reason: 'EMPTY' };
	for (const d of input) {
		if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) {
			return { ok: false, reason: 'INVALID' };
		}
	}
	return { ok: true, days: [...new Set(input as number[])].sort((a, b) => a - b) };
}

/**
 * THE predicate. One professional, one calendar date, pure and synchronous.
 *
 * Reason precedence is blackout > weekday > booked: the most specific, most
 * actionable explanation wins, and a blackout is the one the professional
 * personally did.
 */
export function checkAvailability(
	pattern: CandidateAvailabilityPattern,
	date: string,
	opts: { considerBooked?: boolean } = {}
): AvailabilityCheck {
	const considerBooked = opts.considerBooked ?? true;

	if (pattern.blackoutDates.has(date)) {
		return {
			available: false,
			reason: 'blackout',
			message: 'This professional marked this date as a day they cannot work.'
		};
	}

	// NULL / [] / non-array ⇒ never set ⇒ every weekday permitted.
	if (hasCustomWeeklyPattern(pattern.availableDays)) {
		const dow = dayOfWeekFromDateString(date);
		if (!pattern.availableDays!.includes(dow)) {
			return {
				available: false,
				reason: 'weekday',
				message: `This professional does not work ${WEEKDAY_NAMES[dow]}s.`
			};
		}
	}

	if (considerBooked && pattern.bookedDates.has(date)) {
		return {
			available: false,
			reason: 'booked',
			message: 'This professional is already working a shift on this date.'
		};
	}

	return { available: true };
}

/** Every blocked date within `dates`, with reasons. Drives the admin warning badge. */
export function blockedDatesWithin(
	pattern: CandidateAvailabilityPattern,
	dates: string[],
	opts: { considerBooked?: boolean } = {}
): BlockedDate[] {
	const blocked: BlockedDate[] = [];
	for (const date of dates) {
		const result = checkAvailability(pattern, date, opts);
		if (!result.available) {
			blocked.push({ date, reason: result.reason, message: result.message });
		}
	}
	return blocked;
}

/**
 * In-memory list filter, for post-query filtering where a SQL clause is not
 * available. `keepIf` is the escape hatch for rows that must survive regardless —
 * notably the professional's own already-claimed shifts.
 */
export function filterByAvailability<T>(
	rows: T[],
	getDate: (row: T) => string,
	pattern: CandidateAvailabilityPattern,
	opts: { considerBooked?: boolean; keepIf?: (row: T) => boolean } = {}
): T[] {
	return rows.filter((row) => {
		if (opts.keepIf?.(row)) return true;
		return checkAvailability(pattern, getDate(row), opts).available;
	});
}

/**
 * Trim a notification blast to the recipients and days that actually make sense.
 *
 * PER-CANDIDATE, NOT PER-BLAST: someone available Mon–Wed must still hear about a
 * Mon–Fri posting, so each recipient keeps only the days they can take and is
 * dropped only when nothing is left.
 *
 * Extracted as a pure function so the blast's filtering is testable without mocking
 * Twilio, Brevo and the database — and so that the days each recipient receives
 * cannot drift from the days they were selected for.
 */
export function selectNotifiableCandidates<
	C extends { candidateId: string },
	D extends { date: string }
>(
	candidates: C[],
	days: D[],
	unavailability: Map<string, Array<{ date: string; reason: AvailabilityBlockReason }>>
): Array<{ candidate: C; days: D[] }> {
	const result: Array<{ candidate: C; days: D[] }> = [];
	for (const candidate of candidates) {
		const blocked = unavailability.get(candidate.candidateId);
		if (!blocked?.length) {
			// Fresh array per recipient. A shared reference is how "trim the filter but
			// share the copy" happens, which texts someone about a day they told us
			// they cannot work while claiming the message matches their availability.
			result.push({ candidate, days: [...days] });
			continue;
		}
		const blockedDates = new Set(blocked.map((b) => b.date));
		const usable = days.filter((d) => !blockedDates.has(d.date));
		if (usable.length > 0) result.push({ candidate, days: usable });
	}
	return result;
}
