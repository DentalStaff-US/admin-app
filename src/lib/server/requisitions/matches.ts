import { and, eq, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { requisitionApplicationTable } from '$lib/server/database/schemas/requisition';
import { getQualifiedProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
import { annotateAndSortMatches, type MatchApplication } from './matchRules';

/**
 * Admin-only "Potential Matches" for a permanent requisition: nearby, credentialed,
 * ACTIVE professionals in the discipline who are open to permanent work.
 *
 * Experience is annotated rather than filtered (below-level pros sort last with a
 * flag) so admins can still vet a near-miss. Pay range is ignored on purpose:
 * perm `hourlyRate` isn't a candidate-facing rate, and `checkCandidateQualified`
 * doesn't enforce it for perm either. Blacklisted pros are already excluded in SQL.
 */
export async function getPermPotentialMatches(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	requisition: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	location: any
) {
	if (!requisition?.permanentPosition || !location) return [];

	// Skills are annotated like experience (`missingSkills`, sorted last) so an admin
	// can still vet a near-miss for the client.
	const candidates = await getQualifiedProfessionalsForRequisition(requisition, location, {
		includeAllExperience: true,
		includeOutsidePayRange: true,
		includeMissingSkills: true
	});
	if (candidates.length === 0) return [];

	const apps = await db
		.select({
			id: requisitionApplicationTable.id,
			candidateId: requisitionApplicationTable.candidateId,
			status: requisitionApplicationTable.status,
			source: requisitionApplicationTable.source
		})
		.from(requisitionApplicationTable)
		.where(
			and(
				eq(requisitionApplicationTable.requisitionId, requisition.id),
				inArray(
					requisitionApplicationTable.candidateId,
					candidates.map((c) => c.candidateId)
				)
			)
		);
	const byCandidate = new Map<string, MatchApplication>(
		apps.map((a) => [a.candidateId, { id: a.id, status: a.status, source: a.source }])
	);

	return annotateAndSortMatches(
		candidates,
		requisition.experienceLevel?.order ?? null,
		byCandidate
	);
}

export type PotentialMatch = Awaited<ReturnType<typeof getPermPotentialMatches>>[number];
