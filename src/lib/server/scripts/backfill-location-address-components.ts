/* eslint-disable no-console */
/**
 * One-shot backfill of the granular address columns on company_office_locations
 * (street_one / city / state / zipcode) from the existing complete_address string.
 *
 * The columns have always existed, but only one of the location write paths ever
 * populated them — onboarding, the admin CSV import, both edit forms and the
 * geocode queue all stored complete_address alone. The clients index filters on
 * city/state/zipcode, so it has nothing to work with until this runs. Going
 * forward every write path keeps the granular fields in sync (see
 * src/lib/server/address and the location branch of src/lib/server/geocode-queue).
 *
 * Run from the admin-app/ root:
 *
 *   # Default: dry-run, reports what WOULD change, writes nothing
 *   tsx src/lib/server/scripts/backfill-location-address-components.ts
 *
 *   # Commit the parseable rows
 *   tsx src/lib/server/scripts/backfill-location-address-components.ts --commit
 *
 *   # Commit, and additionally resolve the unparseable rows through Mapbox.
 *   # ALWAYS --limit the first geocode run: it is one billed request per row.
 *   tsx src/lib/server/scripts/backfill-location-address-components.ts --commit --geocode --limit=25
 *
 * Flags:
 *   --commit         optional. Without it: nothing is written.
 *   --geocode        optional. Queue rows that could not be parsed through Mapbox
 *                    (100ms throttle, one call each). Ignored in dry-run.
 *   --limit=N        optional. Process at most N rows. Default 0 (unlimited).
 *   --company=ID     optional. Restrict to one client company, for spot checks.
 *   --report=PATH    optional. Defaults to ./backfill-reports/<iso>-location-address-(dryrun|commit).json
 *
 * Safety properties:
 *   - Dry-run by default.
 *   - Only ever fills columns that are currently NULL or empty; an existing
 *     city/state/zipcode is never overwritten.
 *   - Never writes street_two. A formatted address cannot be split into line 1 /
 *     line 2 — "123 Main St, Apt 2, Austin, TX" parses with the unit inside
 *     street, so writing street_two would duplicate it.
 *   - Never writes lat/lon in the parse pass. `trg_update_office_geom` fires on
 *     UPDATE OF lat, lon and nulls `geom` when either is null, so a components-
 *     only patch deliberately leaves the PostGIS point alone.
 *   - Rows whose complete_address cannot be confidently parsed are left alone
 *     and reported, rather than guessed at.
 *   - Idempotent: re-running skips rows that are already complete.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { and, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';

import db from '../database/drizzle';
import { clientCompanyTable, companyOfficeLocationTable } from '../database/schemas/client';
import { parseCompleteAddress } from '../address';

type Args = {
	commit: boolean;
	geocode: boolean;
	limit: number;
	company: string | null;
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
	const company = get('company') || null;

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const report =
		get('report') ||
		join('backfill-reports', `${stamp}-location-address-${commit ? 'commit' : 'dryrun'}.json`);

	return { commit, geocode: flag('geocode'), limit, company, report };
}

type LocationFields = {
	streetOne: string | null;
	city: string | null;
	state: string | null;
	zipcode: string | null;
};

type RowDiff = {
	locationId: string;
	companyId: string;
	companyName: string | null;
	locationName: string | null;
	completeAddress: string;
	before: LocationFields;
	after: LocationFields;
};

/** Several location write paths coerce with `|| ''`, so empty string is a real
 *  "missing" state here, not just NULL. */
const empty = (value: string | null): boolean => !value || !value.trim();

async function main() {
	const args = parseArgs();
	console.log(
		`Mode: ${args.commit ? 'COMMIT' : 'DRY-RUN'}${args.geocode && args.commit ? ' (+geocode)' : ''}`
	);

	// Locations with an address string but at least one missing granular field.
	const conditions = [
		isNotNull(companyOfficeLocationTable.completeAddress),
		ne(companyOfficeLocationTable.completeAddress, ''),
		or(
			isNull(companyOfficeLocationTable.city),
			eq(companyOfficeLocationTable.city, ''),
			isNull(companyOfficeLocationTable.state),
			eq(companyOfficeLocationTable.state, ''),
			isNull(companyOfficeLocationTable.zipcode),
			eq(companyOfficeLocationTable.zipcode, '')
		)
	];
	if (args.company) {
		conditions.push(eq(companyOfficeLocationTable.companyId, args.company));
	}

	const rows = await db
		.select({
			id: companyOfficeLocationTable.id,
			companyId: companyOfficeLocationTable.companyId,
			companyName: clientCompanyTable.companyName,
			locationName: companyOfficeLocationTable.name,
			email: companyOfficeLocationTable.email,
			completeAddress: companyOfficeLocationTable.completeAddress,
			streetOne: companyOfficeLocationTable.streetOne,
			city: companyOfficeLocationTable.city,
			state: companyOfficeLocationTable.state,
			zipcode: companyOfficeLocationTable.zipcode,
			lat: companyOfficeLocationTable.lat,
			lon: companyOfficeLocationTable.lon
		})
		.from(companyOfficeLocationTable)
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, companyOfficeLocationTable.companyId))
		.where(and(...conditions))
		.orderBy(companyOfficeLocationTable.id);

	const targets = args.limit > 0 ? rows.slice(0, args.limit) : rows;
	console.log(`Scanning ${targets.length} location(s)${args.limit ? ' (limited)' : ''}...`);

	const applied: RowDiff[] = [];
	const unparseable: {
		locationId: string;
		companyName: string | null;
		locationName: string | null;
		completeAddress: string;
		hasCoords: boolean;
	}[] = [];
	let unchanged = 0;
	let errored = 0;

	for (const row of targets) {
		const completeAddress = row.completeAddress as string;
		const parsed = parseCompleteAddress(completeAddress);

		if (!parsed) {
			unparseable.push({
				locationId: row.id,
				companyName: row.companyName,
				locationName: row.locationName,
				completeAddress,
				hasCoords: Boolean(row.lat && row.lon)
			});
			continue;
		}

		// Only fill what's missing — an existing value always wins.
		const patch: Partial<LocationFields> = {};
		if (empty(row.streetOne) && parsed.street) patch.streetOne = parsed.street;
		if (empty(row.city) && parsed.city) patch.city = parsed.city;
		if (empty(row.state) && parsed.state) patch.state = parsed.state;
		if (empty(row.zipcode) && parsed.zipcode) patch.zipcode = parsed.zipcode;

		if (!Object.keys(patch).length) {
			unchanged++;
			continue;
		}

		const diff: RowDiff = {
			locationId: row.id,
			companyId: row.companyId,
			companyName: row.companyName,
			locationName: row.locationName,
			completeAddress,
			before: {
				streetOne: row.streetOne,
				city: row.city,
				state: row.state,
				zipcode: row.zipcode
			},
			after: {
				streetOne: patch.streetOne ?? row.streetOne,
				city: patch.city ?? row.city,
				state: patch.state ?? row.state,
				zipcode: patch.zipcode ?? row.zipcode
			}
		};

		if (args.commit) {
			try {
				await db
					.update(companyOfficeLocationTable)
					.set({ ...patch, updatedAt: new Date() })
					.where(eq(companyOfficeLocationTable.id, row.id));
			} catch (err) {
				errored++;
				console.error(`✗ ${row.id} (${row.companyName} / ${row.locationName}):`, err);
				continue;
			}
		}

		applied.push(diff);
		if (applied.length % 100 === 0) console.log(`  ...${applied.length} processed`);
	}

	// Rows we couldn't parse can still be resolved by Mapbox. This calls the
	// geocoder directly rather than going through geocode-queue: that queue is
	// built for the long-lived web server, and its mapbox.ts import pulls in
	// `$env/static/public`, which cannot resolve under tsx.
	let geocoded = 0;
	let geocodeFailed = 0;
	let coordsFilled = 0;
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
					if (geo?.components.street) patch.streetOne = geo.components.street;
					if (geo?.components.city) patch.city = geo.components.city;
					if (geo?.components.state) patch.state = geo.components.state;
					if (geo?.components.zipcode) patch.zipcode = geo.components.zipcode;

					// Fill coordinates only when the row has none. Writing lat/lon
					// fires trg_update_office_geom and populates `geom`, which the
					// candidate radius searches depend on. Never overwrite existing
					// coordinates, and never write a null — the trigger nulls geom
					// whenever either value is null.
					if (geo && !row.hasCoords) {
						patch.lat = geo.lat.toString();
						patch.lon = geo.lon.toString();
						patch.timezone = geo.timezone;
					}

					if (!Object.keys(patch).length) {
						console.warn(`  ✗ no components returned: ${row.completeAddress}`);
						geocodeFailed++;
					} else {
						await db
							.update(companyOfficeLocationTable)
							.set({ ...patch, updatedAt: new Date() })
							.where(eq(companyOfficeLocationTable.id, row.locationId));
						geocoded++;
						if (patch.lat) coordsFilled++;
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
			coordsFilled,
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
	console.log(`Coords filled:      ${report.counts.coordsFilled}`);
	console.log(`Errored:            ${report.counts.errored}`);
	console.log(`Report:             ${reportPath}`);

	if (!args.commit) {
		console.log('');
		console.log('Dry-run only — nothing was written. Re-run with --commit to apply.');
	}
	if (unparseable.length && !args.geocode) {
		console.log(
			`Tip: ${unparseable.length} row(s) could not be parsed. Re-run with --commit --geocode --limit=25 to resolve them via Mapbox.`
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
