/**
 * SQL mirrors of the predicates in `./certStatus.ts`. The two files MUST change
 * together — `certStatus.ts` is the authority, this is the version the database
 * can evaluate.
 *
 * Used by:
 *   - queries/candidates.ts → getQualifiedProfessionalsForRequisition (the admin /
 *     client candidate-search surface AND the new-workday notification blast)
 *   - the candidate-facing listing endpoints, as a projection, to decide which of a
 *     professional's disciplines are eligible before building the requisition query
 */

import { sql } from 'drizzle-orm';
import { candidateDisciplineExperienceTable as cde } from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { CERT_TIMEZONE } from './certStatus';

/**
 * "Today" as a calendar date in the business timezone. `CURRENT_DATE` would use the
 * server clock (UTC on Railway) and flip a day early for everyone west of ET.
 */
export const nyTodaySql = sql.raw(`(now() AT TIME ZONE '${CERT_TIMEZONE}')::date`);

/**
 * `candidate_document_uploads.expiry_date` is a true `date` column, so it needs no
 * cast and no timezone pinning — comparisons against `nyTodaySql` are plain date
 * arithmetic. (It was `timestamptz` until migration 0060; see the schema comment.)
 */
const EXPIRY_AS_DATE = `cdu.expiry_date`;

/** The document types that can gate placement. Mirrors CERT_CREDENTIAL_TYPES. */
const CREDENTIAL_TYPES_SQL = `('LICENSE','CERTIFICATE')`;

/**
 * The latest expiry across a (candidate, discipline) pair's linked credentials, as a
 * DATE for use in SQL comparisons. NULL when none is on file.
 *
 * MAX rather than "newest row by created_at" so re-uploading an older certificate can
 * never un-renew someone, and a back-dated upload still resolves correctly.
 */
function maxExpiryDateSql(t: typeof cde) {
	return sql`(
		SELECT MAX(${sql.raw(EXPIRY_AS_DATE)})
		FROM candidate_document_uploads cdu
		WHERE cdu.candidate_id = ${t.candidateId}
			AND cdu.discipline_id = ${t.disciplineId}
			AND cdu.type IN ${sql.raw(CREDENTIAL_TYPES_SQL)}
			AND cdu.expiry_date IS NOT NULL
	)`;
}

/**
 * Projection form of the effective expiry, for `CertInput.effectiveExpiry`, badges
 * and the reminder scan.
 *
 * Rendered with `to_char`, NOT returned as a date, for two reasons:
 *   1. node-postgres parses a `date` result (OID 1082) into a JS `Date` at local
 *      midnight. `certState` compares ISO strings, so a Date would make
 *      `effectiveExpiry < today` a silently wrong coercion rather than a type error.
 *   2. `::text` on a date honours the session `DateStyle`, which could yield
 *      '04-30-2026'. `to_char` with an explicit mask is deterministic.
 */
export function effectiveCertExpirySql(t: typeof cde = cde) {
	return sql<string | null>`to_char(${maxExpiryDateSql(t)}, 'YYYY-MM-DD')`;
}

/**
 * SQL form of `isCertBlocked(...) === false` — TRUE means "this discipline may be
 * matched". Passes when:
 *   - the discipline requires no credential (NOT_REQUIRED), or
 *   - nothing is on file (MISSING — warned and chased, deliberately not gated), or
 *   - the latest credential is still current (valid THROUGH its expiry date).
 *
 * Compares dates, not text, so it stays index-friendly. Requires `disciplineTable`
 * to be joined in the query.
 */
export function certNotExpiredSql(
	t: typeof cde = cde,
	d: typeof disciplineTable = disciplineTable
) {
	return sql`(
		${d.requiresCertification} = false
		OR COALESCE(${maxExpiryDateSql(t)} >= ${nyTodaySql}, true)
	)`;
}

/**
 * The two fields every `checkCandidateQualified` call site must add to its
 * candidate-discipline select, so the shape cannot drift between the five of them.
 * Spread into the select object; requires `disciplineTable` joined.
 */
export function certSelectFields(t: typeof cde = cde, d: typeof disciplineTable = disciplineTable) {
	return {
		requiresCertification: d.requiresCertification,
		effectiveExpiry: effectiveCertExpirySql(t)
	};
}
