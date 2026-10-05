/**
 * Single definition of "may this professional be matched for this discipline?".
 *
 * TWO INDEPENDENT TRACKS, one answer:
 *
 *   LICENSE — required platform-wide by `disciplines.requires_license`. Legally
 *     necessary to practise, true for everyone holding the discipline. The date is
 *     DERIVED: MAX(expiry_date) over that discipline's linked LICENSE documents.
 *     A lapsed license blocks immediately. A MISSING one blocks only once a 30-day
 *     grace period, started when the professional was first notified, runs out.
 *
 *   CERTIFICATION — varies by state and by person, so the professional declares it
 *     on their Experience & Rates entry. `candidate_discipline_experience
 *     .requires_cert` / `.cert_expires_on` are AUTHORITATIVE; linked CERTIFICATE
 *     documents are supporting evidence. A lapsed certification blocks immediately.
 *     A missing one only warns — it can arise only from an admin slip, which belongs
 *     in the digest rather than in a lockout.
 *
 * "Credential" is the umbrella term. "Certification" means the second track ONLY.
 * Keeping that distinction in the names is deliberate: the previous single-concept
 * version called everything "cert", which is how a license came to be described to
 * professionals as a certificate.
 *
 * Dependency-free (no Drizzle, no $env) so `qualifyCandidate.ts` can stay pure and
 * synchronous. The SQL mirror lives in ./credentialGateSql.ts; the two MUST move
 * together.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export const CERT_TIMEZONE = 'America/New_York';

/** Days a professional has to supply a MISSING license after being notified. */
export const LICENSE_GRACE_DAYS = 30;

/** Inside this window the professional is in the reminder series. */
export const CERT_EXPIRING_SOON_DAYS = 60;

/** Documents whose expiry can gate placement. Only a LICENSE carries a license date. */
export const LICENSE_DOC_TYPES = ['LICENSE'] as const;
/** Evidence for a certification. The DATE comes from the CDE row, not from these. */
export const CERT_EVIDENCE_DOC_TYPES = ['CERTIFICATE'] as const;
/** Types that may carry a discipline link and an expiry at all. */
export const LINKABLE_CREDENTIAL_TYPES = ['LICENSE', 'CERTIFICATE'] as const;

export const CREDENTIAL_TRACKS = ['LICENSE', 'CERTIFICATION'] as const;
export type CredentialTrack = (typeof CREDENTIAL_TRACKS)[number];

export type CertState =
	/** Not required for this discipline. Renders nothing; never gates. */
	| 'NOT_REQUIRED'
	/** Required, nothing on file, and not yet on the clock (or never will be). */
	| 'MISSING'
	/** Required, nothing on file, grace running. Blocks when it expires. */
	| 'MISSING_GRACE'
	| 'VALID'
	/** Valid, but inside CERT_EXPIRING_SOON_DAYS. */
	| 'EXPIRING'
	/** Blocks. */
	| 'EXPIRED';

export type CredentialInput = {
	required: boolean;
	/** 'YYYY-MM-DD', or null when nothing is on file. */
	expiresOn: string | null;
	/**
	 * LICENSE only: when the professional was first told it was missing. Null means
	 * they have not been notified, so no countdown is running. Ignored once
	 * `expiresOn` is set.
	 */
	graceStartedOn?: string | null;
};

export type DisciplineCredentials = {
	license: CredentialInput;
	certification: CredentialInput;
};

/** 'YYYY-MM-DD' for "today" in the business timezone. */
export function todayInET(now: Date = new Date()): string {
	return formatInTimeZone(now, CERT_TIMEZONE, 'yyyy-MM-dd');
}

/** Whole calendar days from `today` to `date`; negative once past. */
export function daysUntil(date: string, today: string): number {
	return differenceInCalendarDays(parseISO(date), parseISO(today));
}

/** Backwards-compatible alias used throughout the reminder code. */
export const daysUntilExpiry = daysUntil;

/**
 * State of ONE track. ISO 'YYYY-MM-DD' strings compare lexicographically exactly as
 * they compare chronologically, so nothing is parsed on the common path.
 */
export function credentialState(c: CredentialInput, today: string): CertState {
	if (!c.required) return 'NOT_REQUIRED';

	if (!c.expiresOn) {
		// Nothing on file. Only the license track has a clock; without one this is a
		// plain warning.
		if (!c.graceStartedOn) return 'MISSING';
		return daysUntil(c.graceStartedOn, today) + LICENSE_GRACE_DAYS > 0
			? 'MISSING_GRACE'
			: 'EXPIRED';
	}

	// Valid THROUGH the printed date: the expiry day itself still passes, and lockout
	// begins at 00:00 ET the following day. No grace after a lapse — a grace window on
	// a lapsed credential is a window in which someone is placed on one.
	if (c.expiresOn < today) return 'EXPIRED';
	return daysUntil(c.expiresOn, today) <= CERT_EXPIRING_SOON_DAYS ? 'EXPIRING' : 'VALID';
}

/** Days left before a MISSING license starts blocking; null when no clock runs. */
export function graceDaysRemaining(c: CredentialInput, today: string): number | null {
	if (!c.required || c.expiresOn || !c.graceStartedOn) return null;
	return Math.max(0, daysUntil(c.graceStartedOn, today) + LICENSE_GRACE_DAYS);
}

export type CredentialGate = {
	states: Record<CredentialTrack, CertState>;
	/**
	 * Tracks that are blocking, LICENSE first so `blockedBy[0]` is deterministic and
	 * the message names the legal one before the self-declared one. Empty iff allowed.
	 */
	blockedBy: Array<{ track: CredentialTrack; expiresOn: string | null }>;
	blocked: boolean;
};

/**
 * Both tracks, one answer. Blocked iff EITHER is EXPIRED.
 *
 * `blockedBy` is an array rather than a single track because both can lapse at once,
 * and the professional needs to be told about both — one action for them, two for us.
 */
export function credentialGate(
	c: DisciplineCredentials,
	today: string = todayInET()
): CredentialGate {
	const states: Record<CredentialTrack, CertState> = {
		LICENSE: credentialState(c.license, today),
		CERTIFICATION: credentialState(c.certification, today)
	};

	const blockedBy: CredentialGate['blockedBy'] = [];
	if (states.LICENSE === 'EXPIRED') {
		blockedBy.push({ track: 'LICENSE', expiresOn: c.license.expiresOn });
	}
	if (states.CERTIFICATION === 'EXPIRED') {
		blockedBy.push({ track: 'CERTIFICATION', expiresOn: c.certification.expiresOn });
	}

	return { states, blockedBy, blocked: blockedBy.length > 0 };
}

export function isCredentialBlocked(c: DisciplineCredentials, today: string): boolean {
	return credentialGate(c, today).blocked;
}

const TRACK_NOUN: Record<CredentialTrack, string> = {
	LICENSE: 'license',
	CERTIFICATION: 'certification'
};

/**
 * What the professional is told wherever the gate bites. Names the credential that
 * actually lapsed — the previous single message told people to upload a certificate
 * when what had expired was their license, which sends them to renew the wrong thing.
 */
export function credentialBlockedMessage(blockedBy: CredentialGate['blockedBy']): string {
	const expiredLicense = blockedBy.some((b) => b.track === 'LICENSE');
	const expiredCert = blockedBy.some((b) => b.track === 'CERTIFICATION');

	if (expiredLicense && expiredCert) {
		return 'Your license/registration and your certification for this discipline have both expired. Upload a current license or registration and a current certificate to see and apply for these positions again.';
	}
	if (expiredLicense) {
		return 'Your license or registration for this discipline has expired, or we do not have a current one on file. Upload a current one to see and apply for these positions again.';
	}
	return 'Your certification for this discipline has expired. Update its expiration date on your profile to see and apply for these positions again.';
}

/** A discipline hidden from a professional's job list, and why. */
export type CertLockedDiscipline = {
	disciplineId: string;
	disciplineName: string;
	abbreviation: string;
	blockedBy: Array<{ track: CredentialTrack; expiresOn: string | null }>;
};

/**
 * Split a professional's disciplines into matchable and blocked.
 *
 * Shared by all three listing endpoints so the rule and the reported shape cannot
 * drift between them.
 */
export function splitByCredentialEligibility<
	T extends DisciplineCredentials & {
		disciplineId: string;
		disciplineName: string;
		abbreviation: string;
	}
>(rows: T[], today: string = todayInET()): { eligible: T[]; certLocked: CertLockedDiscipline[] } {
	const eligible: T[] = [];
	const certLocked: CertLockedDiscipline[] = [];

	for (const row of rows) {
		const gate = credentialGate(row, today);
		if (gate.blocked) {
			certLocked.push({
				disciplineId: row.disciplineId,
				disciplineName: row.disciplineName,
				abbreviation: row.abbreviation,
				blockedBy: gate.blockedBy
			});
		} else {
			eligible.push(row);
		}
	}

	return { eligible, certLocked };
}

export { TRACK_NOUN };
