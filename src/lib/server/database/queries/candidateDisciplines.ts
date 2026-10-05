import { and, eq, notInArray, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateDisciplineExperienceTable as cde } from '$lib/server/database/schemas/candidate';

/** A drizzle client or an open transaction. */
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One Experience & Rates entry, as every caller's payload describes it. */
export type CandidateDisciplineRow = {
	disciplineId: string;
	experienceLevelId: string;
	preferredHourlyMin: number;
	preferredHourlyMax: number;
};

/**
 * The ONLY writer for candidate_discipline_experience's experience columns.
 *
 * Replaces three near-identical implementations that each got something wrong:
 * the admin action deleted every row then re-inserted in an untransacted loop (a
 * failure midway left a professional with no disciplines at all, which removes them
 * from every job list); the candidate endpoint did the same inside a transaction;
 * and the onboarding endpoint only inserted, so any resubmit raised a primary-key
 * violation and surfaced as a 500.
 *
 * WHY `set` IS EXHAUSTIVE AND OMITS THE CERTIFICATION COLUMNS
 * ----------------------------------------------------------
 * `requires_cert` and `cert_expires_on` live on this table but are NOT part of this
 * aggregate. None of the three callers' payloads carry them, and they cannot: zod
 * `.default()` materialises a value before an action can tell "field omitted" from
 * "field sent as false", so a preserve-on-omit rule is unimplementable one layer up
 * in superforms. Leaving the columns out of `set` makes preservation structural — a
 * rate edit CANNOT clear a certification and silently restore hidden jobs, rather
 * than merely not doing so today.
 *
 * They are written only by setDisciplineCertification().
 */
export async function replaceCandidateDisciplines(
	candidateId: string,
	rows: CandidateDisciplineRow[],
	tx: DbExecutor = db
): Promise<void> {
	const keep = rows.map((r) => r.disciplineId);

	// Delete only what the payload dropped, rather than everything.
	//
	// Two reasons beyond the obvious. `created_at` survives on retained rows — the
	// old delete-all reset "how long has this professional held RDH" on every rate
	// edit. And the row is never absent, so the certification columns on it are
	// untouched and there is no window where a concurrent read sees zero disciplines.
	//
	// `notInArray(x, [])` renders as `true` in drizzle, so an empty payload would
	// delete the lot. That is the correct semantic for "the professional now holds
	// nothing", but it must only be reachable deliberately — every caller's schema
	// carries `.min(1)`.
	await tx.delete(cde).where(and(eq(cde.candidateId, candidateId), notInArray(cde.disciplineId, keep)));

	if (rows.length === 0) return;

	// Single statement. NOTE: a duplicate disciplineId within `rows` raises
	// SQLSTATE 21000 ("ON CONFLICT DO UPDATE command cannot affect row a second
	// time"). Both UIs guard duplicates client-side only, so the dedupe refine on
	// every caller's schema is load-bearing, not hygiene.
	await tx
		.insert(cde)
		.values(
			rows.map((r) => ({
				candidateId,
				disciplineId: r.disciplineId,
				experienceLevelId: r.experienceLevelId,
				preferredHourlyMin: r.preferredHourlyMin,
				preferredHourlyMax: r.preferredHourlyMax,
				// createdAt deliberately omitted — defaultNow() owns it on insert, and
				// an update must not touch it.
				updatedAt: new Date()
			}))
		)
		.onConflictDoUpdate({
			target: [cde.candidateId, cde.disciplineId],
			set: {
				experienceLevelId: sql`excluded.experience_level_id`,
				preferredHourlyMin: sql`excluded.preferred_hourly_min`,
				preferredHourlyMax: sql`excluded.preferred_hourly_max`,
				updatedAt: new Date()
			}
		});
}

/** The experience columns of a candidate's current rows, for audit before/after. */
export async function getCandidateDisciplineSnapshot(
	candidateId: string,
	tx: DbExecutor = db
): Promise<CandidateDisciplineRow[]> {
	return tx
		.select({
			disciplineId: cde.disciplineId,
			experienceLevelId: cde.experienceLevelId,
			preferredHourlyMin: cde.preferredHourlyMin,
			preferredHourlyMax: cde.preferredHourlyMax
		})
		.from(cde)
		.where(eq(cde.candidateId, candidateId));
}
