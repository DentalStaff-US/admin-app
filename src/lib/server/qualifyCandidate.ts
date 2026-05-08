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
 *
 * Inputs are intentionally pre-joined: callers fetch candidate disciplines
 * with their experience-level order and preferred rate range, plus the
 * requisition's required experience-level order. The helper itself is
 * synchronous and pure so it can be used inside `.filter(...)` without
 * needing to await each row.
 */

export type CandidateDisciplineWithLevel = {
	disciplineId: string;
	/** order from experience_levels; null when the candidate hasn't set one */
	experienceLevelOrder: number | null;
	preferredHourlyMin: number;
	preferredHourlyMax: number;
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
			reason: 'discipline' | 'experience' | 'rate';
			message: string;
	  };

export function checkCandidateQualified(
	candidateDisciplines: CandidateDisciplineWithLevel[],
	requisition: RequisitionForQualification
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

	// 2. Experience level — only enforced when the requisition specifies one.
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

	// 3. Rate must fall within the candidate's preferred range for this
	//    discipline. A null rate on the requisition is malformed data —
	//    reject conservatively rather than letting it through.
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

	return { qualified: true };
}
