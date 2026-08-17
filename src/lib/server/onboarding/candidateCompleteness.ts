import { sql } from 'drizzle-orm';
// Relative, not `$lib` — this module is imported by
// scripts/backfill-completed-onboarding.ts, which runs under `tsx` where the
// SvelteKit alias does not resolve. Keeping it relative lets the backfill reuse
// the exact predicate below instead of restating it and drifting.
import db from '../database/drizzle';
import { candidateProfileTable } from '../database/schemas/candidate';

/**
 * Single definition of "this professional's profile is complete".
 *
 * Complete means everything up to and including the resume step of onboarding:
 *   - a candidate_profiles row
 *   - complete_address (what the professional actually entered)
 *   - cell phone
 *   - at least one discipline
 *   - at least one RESUME document
 *
 * The optional final step (LICENSE / CERTIFICATE / OTHER uploads) is explicitly
 * NOT part of this — that is what the weekly nudge chases.
 *
 * ADDRESS: keyed on `complete_address`, NOT the granular `address` (street)
 * column. `address` is derived, not entered: `resolveAddressComponents` treats
 * `city && state && zipcode` as sufficient and lets street stay null, and
 * `parseCompleteAddress` returns a null street for any address without a
 * leading street segment. Requiring it would mark genuinely-complete
 * professionals as incomplete — skipping them in the backfill and then emailing
 * them to "finish" a profile they had already finished.
 *
 * COORDINATES are deliberately excluded too. `geom`/`lat`/`lon` are what
 * actually drive shift matching (PostGIS ST_DWithin), but they are populated
 * asynchronously by the geocode queue. Gating completion on them would mean a
 * geocoding failure on our side leaves the professional permanently
 * "incomplete" and permanently nudged. Completeness measures what the
 * professional was asked to do; un-geocoded profiles are an ops problem, and
 * `candidateMissingCoordinatesSql` below surfaces them separately.
 *
 * Deliberately data-driven rather than keyed on `users.onboarding_step`: legacy
 * and admin-created professionals have a NULL step but a perfectly complete
 * profile, and a step-based test would misclassify every one of them.
 *
 * Exported as raw SQL so the identical predicate can be used in a WHERE clause,
 * a SELECT projection, and the hand-run backfill script without drifting.
 */
export const candidateProfileCompleteSql = sql`(
	${candidateProfileTable.completeAddress} IS NOT NULL
	AND btrim(${candidateProfileTable.completeAddress}) <> ''
	AND ${candidateProfileTable.cellPhone} IS NOT NULL AND btrim(${candidateProfileTable.cellPhone}) <> ''
	AND EXISTS (
		SELECT 1 FROM candidate_discipline_experience cde
		WHERE cde.candidate_id = ${candidateProfileTable.id}
	)
	AND EXISTS (
		SELECT 1 FROM candidate_document_uploads cdu
		WHERE cdu.candidate_id = ${candidateProfileTable.id} AND cdu.type = 'RESUME'
	)
)`;

/**
 * Profiles that have an address but never resolved to coordinates, so they
 * cannot be matched to shifts by radius. Not part of completeness (see above) —
 * this is an ops signal for a failed or pending geocode, not something to chase
 * the professional about.
 */
export const candidateMissingCoordinatesSql = sql`(
	${candidateProfileTable.completeAddress} IS NOT NULL
	AND btrim(${candidateProfileTable.completeAddress}) <> ''
	AND ${candidateProfileTable.geom} IS NULL
)`;

/**
 * True when the candidate has at least one of the optional documents collected
 * by the final onboarding step. Used to find "complete profile, no documents".
 */
export const candidateHasOptionalDocsSql = sql`EXISTS (
	SELECT 1 FROM candidate_document_uploads cdu
	WHERE cdu.candidate_id = ${candidateProfileTable.id}
	AND cdu.type IN ('LICENSE', 'CERTIFICATE', 'AGREEMENT', 'OTHER')
)`;

export type CandidateCompleteness = {
	complete: boolean;
	/** Human-readable gaps, used verbatim in nudge email copy. */
	missing: string[];
	hasOptionalDocs: boolean;
	/**
	 * Address entered but not geocoded — they cannot be matched to shifts by
	 * radius. An ops/geocode-queue problem, never surfaced to the professional.
	 */
	missingCoordinates: boolean;
};

/**
 * Per-candidate breakdown. Returns null when the candidate profile doesn't
 * exist. `missing` drives the "here's what's left" copy in nudge emails, so the
 * labels are user-facing.
 */
export async function getCandidateCompleteness(
	candidateId: string
): Promise<CandidateCompleteness | null> {
	const [row] = await db
		.select({
			hasAddress: sql<boolean>`(
				${candidateProfileTable.completeAddress} IS NOT NULL
				AND btrim(${candidateProfileTable.completeAddress}) <> ''
			)`,
			// Reported for ops visibility; not a completeness gap.
			missingCoordinates: candidateMissingCoordinatesSql.as('missing_coordinates'),
			hasPhone: sql<boolean>`(
				${candidateProfileTable.cellPhone} IS NOT NULL AND btrim(${candidateProfileTable.cellPhone}) <> ''
			)`,
			hasDiscipline: sql<boolean>`EXISTS (
				SELECT 1 FROM candidate_discipline_experience cde
				WHERE cde.candidate_id = ${candidateProfileTable.id}
			)`,
			hasResume: sql<boolean>`EXISTS (
				SELECT 1 FROM candidate_document_uploads cdu
				WHERE cdu.candidate_id = ${candidateProfileTable.id} AND cdu.type = 'RESUME'
			)`,
			hasOptionalDocs: candidateHasOptionalDocsSql.as('has_optional_docs')
		})
		.from(candidateProfileTable)
		.where(sql`${candidateProfileTable.id} = ${candidateId}`)
		.limit(1);

	if (!row) return null;

	const missing: string[] = [];
	if (!row.hasAddress) missing.push('Home address');
	if (!row.hasPhone) missing.push('Mobile phone number');
	if (!row.hasDiscipline) missing.push('At least one discipline and experience level');
	if (!row.hasResume) missing.push('Resume');

	return {
		complete: missing.length === 0,
		missing,
		hasOptionalDocs: Boolean(row.hasOptionalDocs),
		missingCoordinates: Boolean(row.missingCoordinates)
	};
}

/** Convenience wrapper for the completion trigger. */
export async function isCandidateProfileComplete(candidateId: string): Promise<boolean> {
	const result = await getCandidateCompleteness(candidateId);
	return Boolean(result?.complete);
}
