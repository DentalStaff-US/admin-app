/**
 * Single source of truth for "is this candidate qualified for this
 * requisition?". Used by:
 *
 *   - api/external/getOpeningsForCandidate (permanent listing post-filter)
 *   - api/external/applyForRequisition (permanent apply gate)
 *   - api/external/applyForTempRequisition (temp claim gate)
 *
 * Mirrors the predicates in:
 *   - lib/server/database/queries/candidates.ts → getQualifiedProfessionalsForRequisition
 *   - api/external/getTempRequisitionsForCandidate (in-memory filter near
 *     line 232)
 *   - lib/server/certifications/certGateSql.ts → certNotExpiredSql (the SQL twin of
 *     the certification gate below; the two must change together)
 *
 * Inputs are intentionally pre-joined: callers fetch candidate disciplines
 * with their experience-level order and preferred rate range, plus the
 * requisition's required experience-level order. The helper itself is
 * synchronous and pure so it can be used inside `.filter(...)` without
 * needing to await each row.
 */

import { CERT_BLOCKED_MESSAGE, isCertBlocked, todayInET } from './certifications/certStatus';

export type CandidateDisciplineWithLevel = {
	disciplineId: string;
	/** order from experience_levels; null when the candidate hasn't set one */
	experienceLevelOrder: number | null;
	preferredHourlyMin: number;
	preferredHourlyMax: number;
	/**
	 * These two satisfy `CertInput` structurally, so a discipline row can be handed
	 * straight to `isCertBlocked`/`certState`.
	 *
	 * `requiresCertification` is disciplines.requires_certification (the admin-set
	 * requirement). `effectiveExpiry` is MAX(expiry_date) over this discipline's
	 * linked LICENSE/CERTIFICATE documents as 'YYYY-MM-DD', null when none is on
	 * file — callers fetch it with `effectiveCertExpirySql()` so this helper can
	 * stay pure and synchronous.
	 */
	requiresCertification: boolean;
	effectiveExpiry: string | null;
};

export type RequisitionForQualification = {
	disciplineId: string;
	/** order from experience_levels; null = "no preference" — anyone with the
	 *  matching discipline qualifies on the experience axis. */
	experienceLevelOrder: number | null;
	/** hourly rate posted on the requisition; null falls outside any range so
	 *  we conservatively reject (a posted shift should always have a rate). */
	hourlyRate: number | null;
};

export type QualificationCheck =
	| { qualified: true }
	| {
			qualified: false;
			reason: 'discipline' | 'certification' | 'experience' | 'rate';
			message: string;
	  };

export function checkCandidateQualified(
	candidateDisciplines: CandidateDisciplineWithLevel[],
	requisition: RequisitionForQualification,
	opts: {
		/**
		 * Temp semantics enforce the candidate's preferred rate range; PERMANENT
		 * listings deliberately do not (perm rate semantics differ from temp
		 * hourly). Defaults to true so every existing temp caller is unchanged;
		 * the two perm paths pass false, which reproduces exactly what their
		 * hand-rolled filters did before they adopted this helper.
		 */
		enforceRate?: boolean;
		/** 'YYYY-MM-DD' in America/New_York. Injected by tests; defaults to now. */
		today?: string;
	} = {}
): QualificationCheck {
	// 1. Discipline must match.
	const matching = candidateDisciplines.find(
		(d) => d.disciplineId === requisition.disciplineId
	);
	if (!matching) {
		return {
			qualified: false,
			reason: 'discipline',
			message: 'You do not have the required discipline for this position.'
		};
	}

	// 2. Certification / registration must not have lapsed for this discipline.
	//    Ordered ahead of experience and rate on purpose: when a professional fails
	//    several checks, the one we want them to read is the one they can act on.
	//    Only an EXPIRED credential blocks — a discipline needing none, or needing
	//    one with nothing yet on file (MISSING), passes here and is chased through
	//    badges, the admin digest and the nudge series instead. See certStatus.ts.
	if (isCertBlocked(matching, opts.today ?? todayInET())) {
		return {
			qualified: false,
			reason: 'certification',
			message: CERT_BLOCKED_MESSAGE
		};
	}

	// 3. Experience level — only enforced when the requisition specifies one.
	//    Null on the requisition means "No Preference"; null on the candidate
	//    side means they haven't set a level for that discipline (treat as 0
	//    so any non-null requirement excludes them).
	if (requisition.experienceLevelOrder !== null) {
		const candidateOrder = matching.experienceLevelOrder ?? 0;
		if (candidateOrder < requisition.experienceLevelOrder) {
			return {
				qualified: false,
				reason: 'experience',
				message: 'You do not meet the required experience level for this position.'
			};
		}
	}

	// 4. Rate must fall within the candidate's preferred range for this
	//    discipline. A null rate on the requisition is malformed data —
	//    reject conservatively rather than letting it through.
	//
	//    Skipped entirely for PERMANENT listings (`enforceRate: false`), whose rate
	//    semantics differ from temp hourly and which have never gated on it.
	if (opts.enforceRate ?? true) {
		if (requisition.hourlyRate === null) {
			return {
				qualified: false,
				reason: 'rate',
				message: 'This position has no hourly rate set.'
			};
		}
		if (
			requisition.hourlyRate < matching.preferredHourlyMin ||
			requisition.hourlyRate > matching.preferredHourlyMax
		) {
			return {
				qualified: false,
				reason: 'rate',
				message: "This position's hourly rate is outside your preferred range."
			};
		}
	}

	return { qualified: true };
}
