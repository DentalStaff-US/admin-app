import { wantsPermanentWork, type StoredWorkPreference } from '$lib/server/workPreference';

// Pure rules behind perm-req Potential Matches and admin recommendations, kept
// DB-free so they're unit-tested.

export type MatchApplication = { id: string; status: string | null; source: string };

/**
 * Keep professionals open to permanent work (PERMANENT, BOTH, or never answered),
 * flag whether each meets the req's experience level (and carries through whether
 * they meet its skill requirements), attach any existing application on this req,
 * and sort fully-qualified first, then by fewest shortfalls, then nearest.
 */
export function annotateAndSortMatches<
	C extends {
		candidateId: string;
		workPreference: string | null;
		experienceLevelOrder: number | null;
		distance: string | number | null;
		/** From getQualifiedProfessionalsForRequisition; absent = no skill requirements. */
		meetsSkillRequirements?: boolean;
	}
>(
	candidates: C[],
	requiredExperienceOrder: number | null | undefined,
	applicationsByCandidate: Map<string, MatchApplication>
) {
	return (
		candidates
			// Unknown values fall through to BOTH inside the helper, so the cast is safe.
			.filter((c) => wantsPermanentWork(c.workPreference as StoredWorkPreference))
			.map((c) => ({
				...c,
				meetsExperience:
					requiredExperienceOrder == null ||
					(c.experienceLevelOrder ?? -Infinity) >= requiredExperienceOrder,
				meetsSkillRequirements: c.meetsSkillRequirements ?? true,
				application: applicationsByCandidate.get(c.candidateId) ?? null
			}))
			.sort((a, b) => {
				const shortfalls = (m: { meetsExperience: boolean; meetsSkillRequirements: boolean }) =>
					(m.meetsExperience ? 0 : 1) + (m.meetsSkillRequirements ? 0 : 1);
				const diff = shortfalls(a) - shortfalls(b);
				if (diff !== 0) return diff;
				return Number(a.distance ?? Infinity) - Number(b.distance ?? Infinity);
			})
	);
}

export type RecommendationCheck = {
	consentConfirmed: boolean;
	requisition: { status: string | null; permanentPosition: boolean | null } | null;
	candidateStatus: string | null | undefined;
	clientActive: boolean;
	blacklisted: boolean;
	hasExistingApplication: boolean;
};

/**
 * Why an admin may not put this candidate forward, or null if they may. Mirrors
 * the candidate's own apply checks (api/external/applyForRequisition) minus work
 * preference — the admin vetted them and recorded consent, so that's a UI warning.
 */
export function recommendationBlockReason(c: RecommendationCheck): string | null {
	if (!c.consentConfirmed) {
		return 'Confirm the professional agreed to be put forward before recommending them.';
	}
	if (!c.requisition) return 'Requisition not found.';
	if (!c.requisition.permanentPosition) {
		return 'Recommendations are only available on permanent requisitions.';
	}
	if (c.requisition.status !== 'OPEN') return 'This requisition is no longer open.';
	if (c.candidateStatus !== 'ACTIVE') return 'This professional is not active.';
	if (!c.clientActive) return "The client's account is not active.";
	if (c.blacklisted) return 'This professional is blocked by the client.';
	if (c.hasExistingApplication) {
		return 'This professional already has an application on this requisition.';
	}
	return null;
}
