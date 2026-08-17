/* eslint-disable no-console */
/**
 * One-shot backfill of `users.completed_onboarding` for existing professionals.
 *
 * The candidate app never wrote this flag — it only advances `onboarding_step` —
 * so every existing professional reads as "not onboarded". Left alone, the
 * onboarding lifecycle nudges would email the entire active roster telling them
 * to finish a profile they finished long ago.
 *
 * Marks ACTIVE professionals complete only if their profile actually satisfies
 * the completeness predicate. Incomplete ones are deliberately left alone so the
 * stalled-onboarding campaign picks them up instead.
 *
 * Run from the dental-staff-app/ root:
 *
 *   # Default: dry-run, reports what WOULD change, writes nothing
 *   tsx src/lib/server/scripts/backfill-completed-onboarding.ts
 *
 *   # Commit
 *   tsx src/lib/server/scripts/backfill-completed-onboarding.ts --commit
 *
 * Flags:
 *   --commit       optional. Without it: nothing is written.
 *   --limit=N      optional. Process at most N rows. Default 0 (unlimited).
 *   --report=PATH  optional. Defaults to
 *                  ./backfill-reports/<iso>-completed-onboarding-(dryrun|commit).json
 *
 * Safety properties:
 *   - Dry-run by default.
 *   - Only ever flips false -> true, and only for ACTIVE professionals whose
 *     profile is complete. Never clears the flag.
 *   - Completeness is imported from src/lib/server/onboarding/candidateCompleteness,
 *     the same predicate the app and the nudge jobs use, so this cannot drift
 *     from runtime behaviour.
 *   - Idempotent: re-running skips rows already marked complete.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';

import db from '../database/drizzle';
import { userTable } from '../database/schemas/auth';
import { candidateProfileTable } from '../database/schemas/candidate';
import { candidateProfileCompleteSql } from '../onboarding/candidateCompleteness';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
const REPORT_ARG = args.find((a) => a.startsWith('--report='))?.split('=')[1];

function reportPath(): string {
	if (REPORT_ARG) return isAbsolute(REPORT_ARG) ? REPORT_ARG : join(process.cwd(), REPORT_ARG);
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const mode = COMMIT ? 'commit' : 'dryrun';
	return join(process.cwd(), 'backfill-reports', `${stamp}-completed-onboarding-${mode}.json`);
}

async function main() {
	console.log(`\ncompleted_onboarding backfill — ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);

	const rows = await db
		.select({
			userId: userTable.id,
			email: userTable.email,
			candidateId: candidateProfileTable.id,
			status: candidateProfileTable.status,
			completedOnboarding: userTable.completedOnboarding,
			complete: candidateProfileCompleteSql.as('complete'),
			hasAddress: sql<boolean>`(${candidateProfileTable.completeAddress} IS NOT NULL AND btrim(${candidateProfileTable.completeAddress}) <> '')`,
			hasPhone: sql<boolean>`(${candidateProfileTable.cellPhone} IS NOT NULL AND btrim(${candidateProfileTable.cellPhone}) <> '')`,
			hasDiscipline: sql<boolean>`EXISTS (SELECT 1 FROM candidate_discipline_experience cde WHERE cde.candidate_id = ${candidateProfileTable.id})`,
			hasResume: sql<boolean>`EXISTS (SELECT 1 FROM candidate_document_uploads cdu WHERE cdu.candidate_id = ${candidateProfileTable.id} AND cdu.type = 'RESUME')`
		})
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.where(and(eq(userTable.role, 'CANDIDATE'), eq(candidateProfileTable.status, 'ACTIVE')));

	const scoped = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

	const toUpdate = scoped.filter((r) => r.complete && !r.completedOnboarding);
	const alreadyDone = scoped.filter((r) => r.complete && r.completedOnboarding);
	const incomplete = scoped.filter((r) => !r.complete);

	const missingFor = (r: (typeof scoped)[number]) =>
		[
			!r.hasAddress && 'address',
			!r.hasPhone && 'phone',
			!r.hasDiscipline && 'discipline',
			!r.hasResume && 'resume'
		].filter(Boolean) as string[];

	console.log(`  ACTIVE professionals scanned : ${scoped.length}`);
	console.log(`  complete, already flagged    : ${alreadyDone.length}`);
	console.log(`  complete, WOULD UPDATE       : ${toUpdate.length}`);
	console.log(`  incomplete, left for nudges  : ${incomplete.length}`);

	if (incomplete.length) {
		console.log('\n  incomplete worklist (first 25):');
		incomplete
			.slice(0, 25)
			.forEach((r) => console.log(`    ${r.email}  missing: ${missingFor(r).join(', ')}`));
		if (incomplete.length > 25) console.log(`    …and ${incomplete.length - 25} more (see report)`);
	}

	let updated = 0;
	if (COMMIT && toUpdate.length) {
		for (const r of toUpdate) {
			await db
				.update(userTable)
				.set({ completedOnboarding: true, updatedAt: new Date() })
				.where(eq(userTable.id, r.userId));
			updated++;
		}
		console.log(`\n  updated: ${updated}`);
	} else if (!COMMIT) {
		console.log('\n  dry run — nothing written. Re-run with --commit to apply.');
	}

	const path = reportPath();
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		JSON.stringify(
			{
				mode: COMMIT ? 'commit' : 'dryrun',
				scanned: scoped.length,
				alreadyFlagged: alreadyDone.length,
				updated: COMMIT ? updated : 0,
				wouldUpdate: toUpdate.map((r) => ({ email: r.email, candidateId: r.candidateId })),
				incomplete: incomplete.map((r) => ({
					email: r.email,
					candidateId: r.candidateId,
					missing: missingFor(r)
				}))
			},
			null,
			2
		)
	);
	console.log(`  report: ${path}\n`);
	process.exit(0);
}

main().catch((err) => {
	console.error('backfill-completed-onboarding failed:', err);
	process.exit(1);
});
