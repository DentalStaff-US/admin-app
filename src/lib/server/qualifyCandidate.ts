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
 *   - lib/server/certifications/credentialGateSql.ts → credentialNotExpiredSql (the
 *     SQL twin of the credential gate below; the two must change together)
 *
 * Inputs are intentionally pre-joined: callers fetch candidate disciplines
 * with their experience-level order and preferred rate range, plus the
 * requisition's required experience-level order. The helper itself is
 * synchronous and pure so it can be used inside `.filter(...)` without
 * needing to await each row.
 */

import {
	credentialBlockedMessage,
	credentialGate,
	todayInET,
	type DisciplineCredentials
} from './certifications/credentialStatus';

export type CandidateDisciplineWithLevel = {
	disciplineId: string;
	/** order from experience_levels; null when the candidate hasn't set one */
	experienceLevelOrder: number | null;
	preferredHourlyMin: number;
	preferredHourlyMax: number;
	/**
	 * Both credential tracks for this discipline, as `credentialSelectFields()`
	 * projects them — so a selected row satisfies `DisciplineCredentials`
	 * structurally and can be handed straight to `credentialGate`.
	 */
	license: DisciplineCredentials['license'];
	certification: DisciplineCredentials['certification'];
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
			reason: 'discipline' | 'license' | 'certification' | 'experience' | 'rate';
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

	// 2. Neither credential track may have lapsed for this discipline.
	//    Ordered ahead of experience and rate on purpose: when a professional fails
	//    several checks, the one we want them to read is the one they can act on.
	//    Only an EXPIRED track blocks — a discipline needing nothing, or needing a
	//    certification with no date yet, passes here and is chased through badges,
	//    the digest and the nudge series. A MISSING license passes until its 30-day
	//    grace runs out. See credentialStatus.ts.
	const gate = credentialGate(matching, opts.today ?? todayInET());
	if (gate.blocked) {
		return {
			qualified: false,
			// LICENSE first: the reason code's only job is telling support which of two
			// different remediations applies — upload a license document, or update a
			// date on an Experience & Rates entry.
			reason: gate.blockedBy[0].track === 'LICENSE' ? 'license' : 'certification',
			message: credentialBlockedMessage(gate.blockedBy)
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
