/* eslint-disable no-console */
/**
 * One-shot backfill of the granular address columns on candidate_profiles
 * (address / city / state / zipcode) from the existing complete_address string.
 *
 * Existing rows only ever had complete_address populated, so the professionals
 * index has nothing to filter on until this runs. Going forward every write
 * path keeps the granular fields in sync (see src/lib/server/address).
 *
 * Run from the dental-staff-app/ root:
 *
 *   # Default: dry-run, reports what WOULD change, writes nothing
 *   tsx src/lib/server/scripts/backfill-candidate-address-components.ts
 *
 *   # Commit the parseable rows
 *   tsx src/lib/server/scripts/backfill-candidate-address-components.ts --commit
 *
 *   # Commit, and additionally queue the unparseable rows through Mapbox
 *   tsx src/lib/server/scripts/backfill-candidate-address-components.ts --commit --geocode
 *
 * Flags:
 *   --commit       optional. Without it: nothing is written.
 *   --geocode      optional. Queue rows that could not be parsed through the
 *                  existing geocode queue (100ms throttle, one Mapbox call each).
 *                  Ignored in dry-run.
 *   --limit=N      optional. Process at most N rows. Default 0 (unlimited).
 *   --report=PATH  optional. Defaults to ./backfill-reports/<iso>-address-(dryrun|commit).json
 *
 * Safety properties:
 *   - Dry-run by default.
 *   - Only ever fills columns that are currently NULL; an existing city/state/
 *     zipcode is never overwritten.
 *   - Rows whose complete_address cannot be confidently parsed are left alone
 *     and reported, rather than guessed at.
 *   - Idempotent: re-running skips rows that are already complete.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { and, eq, isNotNull, isNull, or, ne } from 'drizzle-orm';

import db from '../database/drizzle';
import { candidateProfileTable } from '../database/schemas/candidate';
import { userTable } from '../database/schemas/auth';
import { parseCompleteAddress } from '../address';

type Args = {
	commit: boolean;
	geocode: boolean;
	limit: number;
	report: string;
};

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const get = (name: string): string | undefined => {
		const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
		if (!hit) return undefined;
		const [, val] = hit.split('=');
		return val ?? '';
	};
	const flag = (name: string): boolean => argv.some((a) => a === `--${name}`);

	const commit = flag('commit');
	const limitRaw = get('limit');
	const limit = limitRaw === undefined ? 0 : Math.max(0, parseInt(limitRaw, 10) || 0);

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const report =
		get('report') || join('backfill-reports', `${stamp}-address-${commit ? 'commit' : 'dryrun'}.json`);

	return { commit, geocode: flag('geocode'), limit, report };
}

type RowDiff = {
	candidateId: string;
	email: string | null;
	completeAddress: string;
	before: { address: string | null; city: string | null; state: string | null; zipcode: string | null };
	after: { address: string | null; city: string | null; state: string | null; zipcode: string | null };
};

async function main() {
	const args = parseArgs();
	console.log(
		`Mode: ${args.commit ? 'COMMIT' : 'DRY-RUN'}${args.geocode && args.commit ? ' (+geocode)' : ''}`
	);

	// Candidates with an address string but at least one missing granular field.
	const rows = await db
		.select({
			id: candidateProfileTable.id,
			email: userTable.email,
			completeAddress: candidateProfileTable.completeAddress,
			address: candidateProfileTable.address,
			city: candidateProfileTable.city,
			state: candidateProfileTable.state,
			zipcode: candidateProfileTable.zipcode
		})
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.where(
			and(
				isNotNull(candidateProfileTable.completeAddress),
				ne(candidateProfileTable.completeAddress, ''),
				or(
					isNull(candidateProfileTable.city),
					isNull(candidateProfileTable.state),
					isNull(candidateProfileTable.zipcode)
				)
			)
		)
		.orderBy(candidateProfileTable.id);

	const targets = args.limit > 0 ? rows.slice(0, args.limit) : rows;
	console.log(`Scanning ${targets.length} candidate profile(s)${args.limit ? ` (limited)` : ''}...`);

	const applied: RowDiff[] = [];
	const unparseable: { candidateId: string; email: string | null; completeAddress: string }[] = [];
	let unchanged = 0;
	let errored = 0;

	for (const row of targets) {
		const completeAddress = row.completeAddress as string;
		const parsed = parseCompleteAddress(completeAddress);

		if (!parsed) {
			unparseable.push({ candidateId: row.id, email: row.email, completeAddress });
			continue;
		}

		// Only fill what's missing — an existing value always wins.
		const patch: Record<string, string> = {};
		if (!row.address && parsed.street) patch.address = parsed.street;
		if (!row.city && parsed.city) patch.city = parsed.city;
		if (!row.state && parsed.state) patch.state = parsed.state;
		if (!row.zipcode && parsed.zipcode) patch.zipcode = parsed.zipcode;

		if (!Object.keys(patch).length) {
			unchanged++;
			continue;
		}

		const diff: RowDiff = {
			candidateId: row.id,
			email: row.email,
			completeAddress,
			before: { address: row.address, city: row.city, state: row.state, zipcode: row.zipcode },
			after: {
				address: patch.address ?? row.address,
				city: patch.city ?? row.city,
				state: patch.state ?? row.state,
				zipcode: patch.zipcode ?? row.zipcode
			}
		};

		if (args.commit) {
			try {
				await db
					.update(candidateProfileTable)
					.set({ ...patch, updatedAt: new Date() })
					.where(eq(candidateProfileTable.id, row.id));
			} catch (err) {
				errored++;
				console.error(`✗ ${row.id} (${row.email}):`, err);
				continue;
			}
		}

		applied.push(diff);
		if (applied.length % 100 === 0) {
			console.log(`  ...${applied.length} processed`);
		}
	}

	// Rows we couldn't parse can still be resolved by Mapbox. This calls the
	// geocoder directly rather than going through geocode-queue: that queue is
	// built for the long-lived web server, and its mapbox.ts import pulls in
	// `$env/static/public`, which cannot resolve under tsx.
	let geocoded = 0;
	let geocodeFailed = 0;
	if (args.commit && args.geocode && unparseable.length) {
		const token = process.env.PUBLIC_MAPBOX_TOKEN;
		if (!token) {
			console.error('PUBLIC_MAPBOX_TOKEN is not set — skipping the geocode pass.');
			geocodeFailed = unparseable.length;
		} else {
			const { geocodeAddressWithToken } = await import('../mapbox-core');
			console.log(`\nGeocoding ${unparseable.length} unparseable address(es) via Mapbox...`);

			for (const row of unparseable) {
				try {
					const geo = await geocodeAddressWithToken(row.completeAddress, token);
					const patch: Record<string, string> = {};
					if (geo?.components.street) patch.address = geo.components.street;
					if (geo?.components.city) patch.city = geo.components.city;
					if (geo?.components.state) patch.state = geo.components.state;
					if (geo?.components.zipcode) patch.zipcode = geo.components.zipcode;

					if (!Object.keys(patch).length) {
						console.warn(`  ✗ no components returned: ${row.completeAddress}`);
						geocodeFailed++;
					} else {
						await db
							.update(candidateProfileTable)
							.set({ ...patch, updatedAt: new Date() })
							.where(eq(candidateProfileTable.id, row.candidateId));
						geocoded++;
						console.log(
							`  ✓ ${patch.city ?? '?'}, ${patch.state ?? '?'} ${patch.zipcode ?? ''} — ${row.completeAddress}`
						);
					}
				} catch (err) {
					console.error(`  ✗ ${row.completeAddress}:`, err);
					geocodeFailed++;
				}

				// Same throttle the in-app queue uses.
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	}

	const report = {
		mode: args.commit ? 'commit' : 'dry-run',
		generatedAt: new Date().toISOString(),
		counts: {
			scanned: targets.length,
			parsed: applied.length,
			alreadyComplete: unchanged,
			unparseable: unparseable.length,
			geocoded,
			geocodeFailed,
			errored
		},
		applied,
		unparseable
	};

	const reportPath = isAbsolute(args.report) ? args.report : join(process.cwd(), args.report);
	mkdirSync(dirname(reportPath), { recursive: true });
	writeFileSync(reportPath, JSON.stringify(report, null, 2));

	console.log('');
	console.log(`Scanned:            ${report.counts.scanned}`);
	console.log(`${args.commit ? 'Updated' : 'Would update'}:      ${report.counts.parsed}`);
	console.log(`Already complete:   ${report.counts.alreadyComplete}`);
	console.log(`Unparseable:        ${report.counts.unparseable}`);
	console.log(`Geocoded:           ${report.counts.geocoded}`);
	console.log(`Geocode failed:     ${report.counts.geocodeFailed}`);
	console.log(`Errored:            ${report.counts.errored}`);
	console.log(`Report:             ${reportPath}`);

	if (!args.commit) {
		console.log('');
		console.log('Dry-run only — nothing was written. Re-run with --commit to apply.');
	}
	if (unparseable.length && !args.geocode) {
		console.log(
			`Tip: ${unparseable.length} row(s) could not be parsed. Re-run with --commit --geocode to resolve them via Mapbox.`
		);
	}

	if (errored > 0) process.exit(1);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
