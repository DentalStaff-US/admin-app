/**
 * Single definition of "is this professional's credential for this discipline OK?".
 *
 * Deliberately dependency-free — no Drizzle, no `$env`, no date-fns-tz beyond the
 * two formatters — so it can be imported by `qualifyCandidate.ts` (which must stay
 * pure and synchronous for use inside `.filter(...)`) and unit-tested without a DB.
 *
 * The SQL mirror of these rules lives in `./certGateSql.ts`. The two MUST move
 * together; `certNotExpiredSql()` carries a pointer back here.
 *
 * THE MODEL (see the plan for why):
 *   - The REQUIREMENT lives on `disciplines.requires_certification` — admin-set,
 *     once per discipline. It is a fact about the discipline, not a per-professional
 *     opinion, so there is no flag on candidate_discipline_experience.
 *   - The DATE lives on `candidate_document_uploads.expiry_date`, on a
 *     LICENSE/CERTIFICATE row linked to the discipline via `discipline_id`.
 *     `effectiveExpiry` is the MAX of those, so "renewal" is simply uploading a
 *     newer certificate.
 *   - There is no second copy of either value anywhere.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/** Everything in this feature resolves "today" in the business timezone. */
export const CERT_TIMEZONE = 'America/New_York';

/**
 * Only these document types gate placement. An AGREEMENT or OTHER that happens to
 * carry an expiry must never hide jobs — an expiring unrelated document is not a
 * lapsed credential.
 */
export const CERT_CREDENTIAL_TYPES = ['LICENSE', 'CERTIFICATE'] as const;

/** Inside this window the professional is in the reminder series. */
export const CERT_EXPIRING_SOON_DAYS = 60;

export type CertState =
	/** Discipline needs no credential. Renders nothing; never gates. */
	| 'NOT_REQUIRED'
	/** Needs one, none on file. Warned and chased — deliberately does NOT gate. */
	| 'MISSING'
	| 'VALID'
	/** Valid, but inside CERT_EXPIRING_SOON_DAYS. */
	| 'EXPIRING'
	/** The only state that hides jobs. */
	| 'EXPIRED';

export type CertInput = {
	/** disciplines.requires_certification */
	requiresCertification: boolean;
	/**
	 * MAX(expiry_date) over this discipline's linked LICENSE/CERTIFICATE rows, as
	 * 'YYYY-MM-DD'. Null means nothing is on file.
	 */
	effectiveExpiry: string | null;
};

/**
 * 'YYYY-MM-DD' for "today" in the business timezone.
 *
 * Not `new Date().toISOString().slice(0,10)`: that is UTC, which would lock a
 * California professional out at 5pm PT on a day their licence is still valid.
 */
export function todayInET(now: Date = new Date()): string {
	return formatInTimeZone(now, CERT_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * ISO 'YYYY-MM-DD' strings compare lexicographically exactly as they compare
 * chronologically, so nothing is parsed on this path.
 */
export function certState(c: CertInput, today: string): CertState {
	if (!c.requiresCertification) return 'NOT_REQUIRED';
	if (!c.effectiveExpiry) return 'MISSING';
	// Valid THROUGH the printed date: the expiry day itself still passes. Lockout
	// begins at 00:00 ET the following day. No grace period beyond that — a grace
	// window is a window in which someone is placed on a lapsed credential.
	if (c.effectiveExpiry < today) return 'EXPIRED';
	return daysUntilExpiry(c.effectiveExpiry, today) <= CERT_EXPIRING_SOON_DAYS
		? 'EXPIRING'
		: 'VALID';
}

/**
 * ONLY 'EXPIRED' hides jobs.
 *
 * MISSING does not, and that is a deploy-safety property rather than an oversight:
 * legacy uploads all landed as type OTHER (the onboarding step hardcoded it),
 * leaving hundreds of ACTIVE professionals with no typed credential on file. If
 * MISSING gated, flagging a single discipline would hide shifts from every
 * professional holding it. MISSING is instead surfaced loudly — badge, admin digest
 * and its own nudge series — while staff collect the backlog.
 */
export function isCertBlocked(c: CertInput, today: string): boolean {
	return certState(c, today) === 'EXPIRED';
}

/** Whole calendar days from `today` to `expiresOn`; negative once lapsed. */
export function daysUntilExpiry(expiresOn: string, today: string): number {
	return differenceInCalendarDays(parseISO(expiresOn), parseISO(today));
}

/** Shown to the professional wherever the gate bites. Written to be read by a human. */
export const CERT_BLOCKED_MESSAGE =
	'Your certification or registration for this discipline has expired. Upload a current ' +
	'certificate to see and apply for these positions again.';

/**
 * What a candidate-facing listing endpoint reports about a discipline it had to hide.
 * Drives the banner on the candidate app's job lists, which is the ONLY way a
 * professional learns why those shifts disappeared (per-listing warnings were
 * deliberately rejected in favour of a page-level notice).
 */
export type CertLockedDiscipline = {
	disciplineId: string;
	disciplineName: string;
	abbreviation: string;
	/** 'YYYY-MM-DD'. Non-null by construction: only EXPIRED rows land here. */
	expiresOn: string;
};

/**
 * Split a professional's disciplines into the ones that may be matched and the ones
 * whose credential has lapsed.
 *
 * Shared by all three listing endpoints so the rule and the reported shape cannot
 * drift between them. Callers build `rows` with `certSelectFields()` plus the
 * discipline name/abbreviation.
 */
export function splitByCertEligibility<
	T extends CertInput & { disciplineId: string; disciplineName: string; abbreviation: string }
>(rows: T[], today: string = todayInET()): { eligible: T[]; certLocked: CertLockedDiscipline[] } {
	const eligible: T[] = [];
	const certLocked: CertLockedDiscipline[] = [];

	for (const row of rows) {
		if (isCertBlocked(row, today)) {
			certLocked.push({
				disciplineId: row.disciplineId,
				disciplineName: row.disciplineName,
				abbreviation: row.abbreviation,
				// Non-null whenever isCertBlocked is true — MISSING (null expiry) is
				// never blocked, so only a real lapsed date reaches here.
				expiresOn: row.effectiveExpiry as string
			});
		} else {
			eligible.push(row);
		}
	}

	return { eligible, certLocked };
}
