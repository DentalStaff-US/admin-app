/**
 * Auto-enrolment backfill.
 *
 * Gives every ACTIVE practice and professional an affiliate profile and a
 * permanent referral code, so "every eligible user already has a link" is true
 * on launch day rather than only for people who happen to visit the portal.
 *
 * Deliberately enrols ONLY ACTIVE accounts: per the product rule, pending,
 * inactive and denied accounts never get a link at all. The nightly
 * reconciliation job picks up anyone who becomes ACTIVE later — but they will
 * not have a profile until they visit the portal or an admin enrols them, so
 * re-running this after a batch of approvals is the intended workflow.
 *
 * Idempotent: ensureAffiliateProfile no-ops for anyone already enrolled, so this
 * is safe to run repeatedly.
 *
 * Usage:
 *   npx tsx db-scripts/backfill-affiliate-profiles.ts            # dry run
 *   npx tsx db-scripts/backfill-affiliate-profiles.ts --commit   # actually write
 */
import { eq, and, isNull } from 'drizzle-orm';
import db from '../src/lib/server/database/drizzle';
import { userTable } from '../src/lib/server/database/schemas/auth';
import { clientProfileTable } from '../src/lib/server/database/schemas/client';
import { candidateProfileTable } from '../src/lib/server/database/schemas/candidate';
import { affiliateProfileTable } from '../src/lib/server/database/schemas/affiliate';
// Imported from affiliate/enroll.ts, NOT queries/affiliates.ts: the latter pulls
// in `logger`, which imports $app/environment and cannot resolve under tsx.
import { ensureAffiliateProfile } from '../src/lib/server/affiliate/enroll';

const COMMIT = process.argv.includes('--commit');

async function main() {
	console.log(COMMIT ? '=== BACKFILL (COMMITTING) ===' : '=== BACKFILL (DRY RUN) ===');

	// ACTIVE clients with no affiliate profile yet.
	const clients = await db
		.select({ userId: userTable.id, email: userTable.email, name: userTable.name })
		.from(clientProfileTable)
		.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.leftJoin(affiliateProfileTable, eq(affiliateProfileTable.userId, userTable.id))
		.where(and(eq(clientProfileTable.status, 'ACTIVE'), isNull(affiliateProfileTable.id)));

	// ACTIVE candidates with no affiliate profile yet.
	const candidates = await db
		.select({ userId: userTable.id, email: userTable.email, name: userTable.name })
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.leftJoin(affiliateProfileTable, eq(affiliateProfileTable.userId, userTable.id))
		.where(and(eq(candidateProfileTable.status, 'ACTIVE'), isNull(affiliateProfileTable.id)));

	console.log(`ACTIVE practices to enrol    : ${clients.length}`);
	console.log(`ACTIVE professionals to enrol: ${candidates.length}`);
	console.log(`TOTAL                        : ${clients.length + candidates.length}\n`);

	if (!COMMIT) {
		console.log('Dry run — no changes written. Re-run with --commit to apply.');
		for (const row of [...clients, ...candidates].slice(0, 10)) {
			console.log(`  would enrol: ${row.email}`);
		}
		if (clients.length + candidates.length > 10) console.log('  ...');
		process.exit(0);
	}

	let enrolled = 0;
	let failed = 0;

	for (const row of [...clients, ...candidates]) {
		try {
			const result = await ensureAffiliateProfile(row.userId, {
				displayName: row.name,
				contactEmail: row.email
			});
			if (result.created) {
				enrolled++;
				console.log(`  enrolled ${row.email} -> ${result.code}`);
			}
		} catch (err) {
			failed++;
			console.error(`  FAILED ${row.email}:`, err instanceof Error ? err.message : err);
		}
	}

	console.log(`\nDone. Enrolled: ${enrolled}. Failed: ${failed}.`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Backfill failed:', err);
	process.exit(1);
});
