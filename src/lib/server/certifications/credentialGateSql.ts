/**
 * SQL mirrors of the predicates in ./credentialStatus.ts, which is the authority.
 * The two MUST change together.
 *
 * Used by queries/candidates.ts (the admin/client candidate search AND the
 * new-workday notification blast) and, as projections, by the five candidate-facing
 * external endpoints.
 */

import { and, sql } from 'drizzle-orm';
import { candidateDisciplineExperienceTable as cde } from '$lib/server/database/schemas/candidate';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { CERT_TIMEZONE, LICENSE_GRACE_DAYS } from './credentialStatus';

/**
 * "Today" as a calendar date in the business timezone. `CURRENT_DATE` would use the
 * server clock (UTC on Railway) and flip a day early for everyone west of ET.
 */
export const nyTodaySql = sql.raw(`(now() AT TIME ZONE '${CERT_TIMEZONE}')::date`);

/** Only a LICENSE document carries a license date. */
const LICENSE_TYPES_SQL = `('LICENSE')`;
/** Only a CERTIFICATE document carries a certification date. */
const CERT_TYPES_SQL = `('CERTIFICATE')`;

/**
 * Latest license expiry for a (candidate, discipline), as a DATE. NULL when none is
 * on file.
 *
 * MAX rather than "newest by created_at" so re-uploading an older document can never
 * un-renew someone, and a back-dated upload still resolves correctly.
 */
function maxExpiryDateSql(t: typeof cde, typesSql: string) {
	return sql`(
		SELECT MAX(cdu.expiry_date)
		FROM candidate_document_uploads cdu
		WHERE cdu.candidate_id = ${t.candidateId}
			AND cdu.discipline_id = ${t.disciplineId}
			AND cdu.type IN ${sql.raw(typesSql)}
			AND cdu.expiry_date IS NOT NULL
	)`;
}

const maxLicenseExpiryDateSql = (t: typeof cde) => maxExpiryDateSql(t, LICENSE_TYPES_SQL);

/**
 * The certification date. Comes from the newest linked CERTIFICATE document, NOT
 * from candidate_discipline_experience.cert_expires_on.
 *
 * That column exists and is deliberately no longer read. Having a date on the
 * Experience & Rates row AND on the document meant two values that could disagree —
 * and they did, visibly, in testing. A date is now written in exactly one place, at
 * upload, beside the file it came from, for both tracks.
 *
 * The Experience row still carries `requires_cert`: whether this professional's
 * state requires one at all is a declaration with no document behind it, and that
 * part genuinely belongs to them.
 */
const maxCertExpiryDateSql = (t: typeof cde) => maxExpiryDateSql(t, CERT_TYPES_SQL);

/** When the grace clock for a missing license started, or NULL if never notified. */
function graceStartedOnSql(t: typeof cde) {
	return sql`(
		SELECT (g.notified_at AT TIME ZONE 'UTC')::date
		FROM candidate_license_grace g
		WHERE g.candidate_id = ${t.candidateId} AND g.discipline_id = ${t.disciplineId}
	)`;
}

/**
 * Projection: the effective license expiry as 'YYYY-MM-DD'.
 *
 * `to_char`, not a bare select: node-postgres parses a `date` (OID 1082) into a JS
 * Date at local midnight, and credentialState compares ISO strings — a Date would
 * make the comparison a silently wrong coercion rather than a type error.
 */
export function effectiveLicenseExpirySql(t: typeof cde = cde) {
	return sql<string | null>`to_char(${maxLicenseExpiryDateSql(t)}, 'YYYY-MM-DD')`;
}

/** Projection: the newest linked CERTIFICATE's expiry as 'YYYY-MM-DD'. */
export function effectiveCertExpirySql(t: typeof cde = cde) {
	return sql<string | null>`to_char(${maxCertExpiryDateSql(t)}, 'YYYY-MM-DD')`;
}

/** Projection: when the missing-license clock started, 'YYYY-MM-DD' or null. */
export function licenseGraceStartedOnSql(t: typeof cde = cde) {
	return sql<string | null>`to_char(${graceStartedOnSql(t)}, 'YYYY-MM-DD')`;
}

/**
 * LICENSE track. Three outcomes rather than two, which is why this is a CASE and not
 * a COALESCE:
 *   - a license on file decides on its date;
 *   - none on file and never notified passes (no clock is running);
 *   - none on file and notified passes only until the grace period runs out.
 */
export function licenseOkSql(t: typeof cde = cde, d: typeof disciplineTable = disciplineTable) {
	return sql`(
		${d.requiresLicense} = false
		OR CASE
			WHEN ${maxLicenseExpiryDateSql(t)} IS NOT NULL
				THEN ${maxLicenseExpiryDateSql(t)} >= ${nyTodaySql}
			WHEN ${graceStartedOnSql(t)} IS NULL THEN true
			ELSE ${graceStartedOnSql(t)} + ${sql.raw(`interval '${LICENSE_GRACE_DAYS} days'`)} > ${nyTodaySql}
		END
	)`;
}

/**
 * CERTIFICATION track. No subquery — both values are columns on the row already in
 * the join. A null date passes: that is the warn-don't-block rule.
 */
export function certificationOkSql(t: typeof cde = cde) {
	return sql`(
		${t.requiresCert} = false
		OR COALESCE(${maxCertExpiryDateSql(t)} >= ${nyTodaySql}, true)
	)`;
}

/** THE gate. One function, both tracks, so no caller can adopt half of it. */
export function credentialNotExpiredSql(
	t: typeof cde = cde,
	d: typeof disciplineTable = disciplineTable
) {
	return and(licenseOkSql(t, d), certificationOkSql(t));
}

/**
 * The fields every `checkCandidateQualified` call site must add to its select.
 *
 * Nested so a selected row structurally satisfies `DisciplineCredentials` — no
 * adapter at any call site.
 */
export function credentialSelectFields(
	t: typeof cde = cde,
	d: typeof disciplineTable = disciplineTable
) {
	return {
		license: {
			required: d.requiresLicense,
			expiresOn: effectiveLicenseExpirySql(t),
			graceStartedOn: licenseGraceStartedOnSql(t)
		},
		certification: {
			required: t.requiresCert,
			// From the document, like the license side. One date, one place.
			expiresOn: effectiveCertExpirySql(t)
		}
	};
}
