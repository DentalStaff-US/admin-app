/**
 * SQL twins of ./skillRequirements.ts (the authority). The two MUST change together.
 *
 * Used where matching happens in the database — getQualifiedProfessionalsForRequisition
 * (admin/client qualified lists and the new-workday blast) — and by the bulk loader
 * that resolves effective skills for the in-memory (candidate-facing) paths.
 */

import { sql, type SQLWrapper } from 'drizzle-orm';
import { nyTodaySql } from '$lib/server/certifications/credentialGateSql';

/** A column, a raw SQL fragment, or a bound value. */
type Expr = SQLWrapper | string | number;

/**
 * Does candidate C EFFECTIVELY hold skill S? Claimed on the profile, and — when the
 * skill requires a certificate — a CERTIFICATE linked to that skill whose expiry is
 * today or later. Skill-linked certificates must carry a date
 * (validateSkillCredentialLink), so there is no dateless case to decide.
 *
 * Archived skills still count: archiving only hides a skill from pickers, it does
 * not retract what professionals and open requisitions already say.
 */
export function candidateHoldsSkillSql(candidateId: Expr, skillId: Expr) {
	return sql`EXISTS (
		SELECT 1
		FROM candidate_skills hs_cs
		JOIN skills hs_s ON hs_s.id = hs_cs.skill_id
		WHERE hs_cs.candidate_id = ${candidateId}
			AND hs_cs.skill_id = ${skillId}
			AND (
				hs_s.requires_certificate = false
				OR EXISTS (
					SELECT 1
					FROM candidate_document_uploads hs_cdu
					WHERE hs_cdu.candidate_id = ${candidateId}
						AND hs_cdu.skill_id = ${skillId}
						AND hs_cdu.type = 'CERTIFICATE'
						AND hs_cdu.expiry_date >= ${nyTodaySql}
				)
			)
	)`;
}

/**
 * Does candidate C meet every skill requirement on requisition R? True when R has
 * no requirement rows (No Preference everywhere — every pre-existing requisition).
 *
 * Phrased as "no failing category exists":
 *   ALL fails when some chosen skill in the category is not held;
 *   ANY fails when no chosen skill in the category is held.
 */
export function skillRequirementsMetSql(requisitionId: Expr, candidateId: Expr) {
	return sql`NOT EXISTS (
		SELECT 1
		FROM requisition_skill_categories rq_c
		WHERE rq_c.requisition_id = ${requisitionId}
			AND (
				(rq_c.match_mode = 'ALL' AND EXISTS (
					SELECT 1
					FROM requisition_skills rq_s
					JOIN skills rq_sk ON rq_sk.id = rq_s.skill_id
					WHERE rq_s.requisition_id = ${requisitionId}
						AND rq_sk.category_id = rq_c.category_id
						AND NOT ${candidateHoldsSkillSql(candidateId, sql`rq_s.skill_id`)}
				))
				OR
				(rq_c.match_mode = 'ANY' AND NOT EXISTS (
					SELECT 1
					FROM requisition_skills rq_s
					JOIN skills rq_sk ON rq_sk.id = rq_s.skill_id
					WHERE rq_s.requisition_id = ${requisitionId}
						AND rq_sk.category_id = rq_c.category_id
						AND ${candidateHoldsSkillSql(candidateId, sql`rq_s.skill_id`)}
				))
			)
	)`;
}

/**
 * Projection: the newest linked skill CERTIFICATE expiry for (C, S), 'YYYY-MM-DD'
 * or null. For display (badges), not gating.
 */
export function skillCertExpirySql(candidateId: Expr, skillId: Expr) {
	return sql<string | null>`to_char((
		SELECT MAX(sc_cdu.expiry_date)
		FROM candidate_document_uploads sc_cdu
		WHERE sc_cdu.candidate_id = ${candidateId}
			AND sc_cdu.skill_id = ${skillId}
			AND sc_cdu.type = 'CERTIFICATE'
			AND sc_cdu.expiry_date IS NOT NULL
	), 'YYYY-MM-DD')`;
}
