/**
 * Read side of a professional's skills: the profile list (with certificate state)
 * and the EFFECTIVE skill ids matching uses. Kept free of the audit writer so the
 * matching queries (queries/candidates.ts) can import it.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateSkillTable } from '$lib/server/database/schemas/candidate';
import { skillCategoryTable, skillTable } from '$lib/server/database/schemas/skill';
import { candidateHoldsSkillSql, skillCertExpirySql } from './skillCredentialSql';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export type CandidateSkillRow = {
	skillId: string;
	name: string;
	categoryId: string;
	categoryName: string;
	requiresCertificate: boolean;
	archived: boolean;
	/** Newest linked CERTIFICATE expiry, 'YYYY-MM-DD', or null. */
	certExpiresOn: string | null;
	/** Counts toward requisition requirements (claimed + cert valid when required). */
	effective: boolean;
};

export async function getCandidateSkills(
	candidateId: string,
	tx: Tx = db
): Promise<CandidateSkillRow[]> {
	return await tx
		.select({
			skillId: skillTable.id,
			name: skillTable.name,
			categoryId: skillCategoryTable.id,
			categoryName: skillCategoryTable.name,
			requiresCertificate: skillTable.requiresCertificate,
			archived: sql<boolean>`${skillTable.archivedAt} IS NOT NULL`,
			certExpiresOn: skillCertExpirySql(candidateSkillTable.candidateId, skillTable.id),
			effective: sql<boolean>`${candidateHoldsSkillSql(candidateSkillTable.candidateId, skillTable.id)}`
		})
		.from(candidateSkillTable)
		.innerJoin(skillTable, eq(skillTable.id, candidateSkillTable.skillId))
		.innerJoin(skillCategoryTable, eq(skillCategoryTable.id, skillTable.categoryId))
		.where(eq(candidateSkillTable.candidateId, candidateId))
		.orderBy(
			skillCategoryTable.sortOrder,
			skillCategoryTable.name,
			skillTable.sortOrder,
			skillTable.name
		);
}

/**
 * Effective skill ids for many professionals at once — for the in-memory
 * qualification paths (candidate openings, apply), so a listing of N requisitions
 * costs one query, not N.
 */
export async function getEffectiveSkillIds(
	candidateIds: string[],
	tx: Tx = db
): Promise<Map<string, Set<string>>> {
	const out = new Map<string, Set<string>>();
	if (candidateIds.length === 0) return out;
	const rows: { candidateId: string; skillId: string }[] = await tx
		.select({ candidateId: candidateSkillTable.candidateId, skillId: candidateSkillTable.skillId })
		.from(candidateSkillTable)
		.where(
			and(
				inArray(candidateSkillTable.candidateId, [...new Set(candidateIds)]),
				candidateHoldsSkillSql(candidateSkillTable.candidateId, candidateSkillTable.skillId)
			)
		);
	for (const r of rows) {
		const set = out.get(r.candidateId) ?? new Set<string>();
		set.add(r.skillId);
		out.set(r.candidateId, set);
	}
	return out;
}

export async function getEffectiveSkillIdsForCandidate(
	candidateId: string,
	tx: Tx = db
): Promise<Set<string>> {
	return (await getEffectiveSkillIds([candidateId], tx)).get(candidateId) ?? new Set();
}
