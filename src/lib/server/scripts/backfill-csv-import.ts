/* eslint-disable no-console */
/**
 * One-shot backfill of existing client + candidate profiles from a CSV.
 *
 * THIS SCRIPT NEVER CREATES USERS. All emails in the CSV are expected to
 * already exist in the database; missing emails are flagged in the report,
 * never inserted.
 *
 * Run from the dental-staff-app/ root:
 *
 *   # Default: dry-run, 50 clients + 50 candidates, report → ./backfill-reports/
 *   tsx src/lib/server/scripts/backfill-csv-import.ts \
 *     --csv=src/lib/server/scripts/user-data.csv
 *
 *   # Smoke commit on a few known users:
 *   tsx src/lib/server/scripts/backfill-csv-import.ts \
 *     --csv=src/lib/server/scripts/user-data.csv \
 *     --only=email1@x.com,email2@x.com \
 *     --commit
 *
 *   # Full commit (only after dry-run has been reviewed and looks correct):
 *   tsx src/lib/server/scripts/backfill-csv-import.ts \
 *     --csv=src/lib/server/scripts/user-data.csv \
 *     --commit
 *
 * Flags:
 *   --csv=PATH               required. Absolute or workspace-relative.
 *   --report=PATH            optional. Defaults to ./backfill-reports/<iso>-(dryrun|commit).json
 *   --commit                 optional. Without it: nothing is written.
 *   --limit-per-role=N       optional. Default 50 in dry-run, 0 (unlimited) with --commit.
 *                            Set to 0 explicitly to disable in dry-run too.
 *   --only=EMAIL[,EMAIL...]  optional. Restrict to specific emails. Overrides --limit-per-role.
 *
 * Safety properties:
 *   - Dry-run by default.
 *   - Reconciliation gate: discipline + experience-level names are resolved
 *     against the DB before any row is processed; unresolved → hard abort.
 *   - Blank CSV cells are treated as "no update"; existing DB values win.
 *   - Per-row transaction with retry on transient errors (deadlock, connection).
 *   - Idempotent: re-running the same row is a no-op (UPDATE to same values + ON
 *     CONFLICT DO UPDATE on candidate_discipline_experience).
 *
 * Plan reference: /Users/richardprins/.claude/plans/ok-i-need-to-frolicking-panda.md
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { and, eq, ilike } from 'drizzle-orm';

import db from '../database/drizzle';
import { userTable } from '../database/schemas/auth';
import { clientProfileTable, clientCompanyTable } from '../database/schemas/client';
import {
	candidateProfileTable,
	candidateDisciplineExperienceTable,
	candidateBlacklistTable
} from '../database/schemas/candidate';
import { disciplineTable, experienceLevelTable } from '../database/schemas/skill';
import { normalizeUSPhone } from '$lib/_helpers/phone';

// -------- CLI parsing --------

type Args = {
	csv: string;
	report: string;
	commit: boolean;
	limitPerRole: number;
	only: string[] | null;
	// Status-only follow-up pass: skip all field updates and only write
	// candidate_profiles.status / client_profiles.status from CSV column AA.
	// See plan: ok-i-need-to-frolicking-panda.md.
	statusOnly: boolean;
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

	const csv = get('csv');
	if (!csv) {
		throw new Error('Missing required flag: --csv=PATH');
	}
	const commit = flag('commit');
	const limitRaw = get('limit-per-role');
	const limitPerRole =
		limitRaw === undefined ? (commit ? 0 : 50) : Math.max(0, parseInt(limitRaw, 10) || 0);
	const onlyRaw = get('only');
	const only = onlyRaw
		? onlyRaw
				.split(',')
				.map((e) => e.trim().toLowerCase())
				.filter(Boolean)
		: null;

	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const reportDefault = join(
		process.cwd(),
		'backfill-reports',
		`${ts}-${commit ? 'commit' : 'dryrun'}.json`
	);
	const report = get('report') || reportDefault;

	return {
		csv: isAbsolute(csv) ? csv : join(process.cwd(), csv),
		report,
		commit,
		limitPerRole,
		only,
		statusOnly: flag('status-only')
	};
}

// Status-only follow-up pass: map the CSV's column AA "Status" cell to a
// candidate/client profile status. Strict match — anything other than
// "active"/"inactive" (case-insensitive, after trim) returns null and the row
// is skipped, so we never accidentally overwrite a real value with garbage.
function mapCsvStatus(csvValue: string | undefined): 'ACTIVE' | 'INACTIVE' | null {
	const v = csvValue?.trim().toLowerCase();
	if (v === 'active') return 'ACTIVE';
	if (v === 'inactive') return 'INACTIVE';
	return null;
}

// -------- CSV column model --------

/**
 * Column letter → CSV header index. We resolve by HEADER NAME at runtime so
 * the script doesn't break if column ordering shifts (it asserts that the
 * expected headers are present).
 */
const EXPECTED_HEADERS = [
	'First Name', // A
	'Last Name', // B
	'Date of Birth', // C
	'Email', // D
	'Address (Street 1)', // E
	'Address (Street 2)', // F
	'City', // G
	'State', // H
	'Zip Code', // I
	'Account Created Date', // J  (skipped)
	'UIN', // K  (skipped — no DB column)
	'Home Phone', // L
	'Company Phone', // M  (client)
	'Cell Phone', // N
	'SSN', // O  (skipped — no DB column)
	'Company Name', // P  (client)
	'EIN #', // Q  (skipped — no DB column)
	'DEA #', // R  (skipped)
	'Invoice Due Date', // S  (skipped)
	'Invoice Total Amount', // T  (skipped)
	'Office/Accountable Manager', // U  (skipped — no DB column)
	'Discipline Type', // V  (candidate)
	'Travel Radius', // W  (skipped — no DB column)
	'Desired Assignment Duration', // X  (skipped — no DB column)
	'Rate of Pay', // Y  (candidate)
	'Experience Level', // Z  (candidate)
	'Status', // AA (not written — per user)
	'Security Group(s)', // AB (routing)
	'Blacklist', // AC (client → candidate blacklist)
	'Region' // AD (skipped)
] as const;

type CsvRow = Record<(typeof EXPECTED_HEADERS)[number], string>;

// -------- Reconciliation: discipline + experience-level aliases --------

/**
 * CSV-side discipline names that map to canonical DB names. Keys are lowercased
 * for case-insensitive comparison. The seed list in `lib/config/constants.ts`
 * is NOT authoritative — actual DB names are queried at runtime from
 * `disciplineTable`. Preflight will print every unresolved CSV value; add
 * mappings here (key = lowercased CSV value, value = exact DB name) and
 * re-run until the resolution table is clean.
 *
 * Start empty; populate based on the first preflight run.
 */
const DISCIPLINE_ALIASES: Record<string, string> = {
	// CSV value (normalized: lowercase, trimmed) → exact DB discipline name.
	// Populated from the first preflight run + four new disciplines added via
	// _add-missing-disciplines.ts. EFDA resolves automatically by abbreviation.
	assistant: 'Dental Assistant',
	'lab tech': 'Lab Technician',
	'insurance biller': 'Insurance Coordinator'
	// The four newly-added DB disciplines (Director of Ops, General Manager,
	// Owner/Operator, General Laborer) match CSV values exactly — no alias
	// needed. Consultant, Dentist, Floater, Front Office, Hygienist, Office
	// Manager also exact-match.
};

/**
 * CSV-side experience level → DB value. Per user rules:
 *   "0-2 Years"     → "0-2 Years"
 *   "Under 2 Years" → "0-2 Years" (logical inverse of "Over 2 Years")
 *   "Over 2 Years"  → "10 years and Over"
 *   "Over 2"        → "10 years and Over" (assumed truncation of "Over 2 Years")
 *   "Any"           → "0-2 Years"  (per user: "No Preference" is for reqs only,
 *                                    candidates must have an actual level)
 *   "No Preference" → "0-2 Years"  (same reason)
 *   blank           → leave existing untouched (no-op; handled in transform)
 */
const EXPERIENCE_ALIASES: Record<string, string> = {
	'0-2 years': '0-2 Years',
	'under 2 years': '0-2 Years',
	'over 2 years': '10 years and Over',
	'over 2': '10 years and Over',
	any: '0-2 Years',
	'no preference': '0-2 Years'
};

// Values we deliberately do NOT write — caller skips the experience update.
// Only true blanks now; "any" and "no preference" are aliased to a real level
// per user instruction.
const EXPERIENCE_NOOP = new Set<string>(['']);

// -------- Helpers --------

function norm(s: string | null | undefined): string {
	return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function nonBlank(s: string | null | undefined): string | null {
	const t = (s ?? '').trim();
	return t.length > 0 ? t : null;
}

function parseUSDate(input: string | null | undefined): string | null {
	// "M/D/YYYY" → "YYYY-MM-DD" (Postgres date format). Returns null if
	// blank or unparseable.
	const s = (input ?? '').trim();
	if (!s) return null;
	const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!m) return null;
	const [, mm, dd, yyyy] = m;
	const month = String(parseInt(mm, 10)).padStart(2, '0');
	const day = String(parseInt(dd, 10)).padStart(2, '0');
	return `${yyyy}-${month}-${day}`;
}

function splitArr(s: string | null | undefined): string[] {
	if (!s) return [];
	return s.split(',').map((t) => t.trim());
}

/**
 * Re-pair a flat list of comma-separated `Last, First` tokens into name pairs.
 * Input like "Hughes, Robert,Cole, Shannon" → ["Hughes","Robert","Cole","Shannon"]
 * → [{lastName:"Hughes", firstName:"Robert"}, {lastName:"Cole", firstName:"Shannon"}]
 *
 * If the count is odd, drops the trailing unpaired token and returns a warning
 * flag so the caller can report it.
 */
function parseLastFirstPairs(raw: string | null | undefined): {
	pairs: Array<{ lastName: string; firstName: string }>;
	hadUnpairedTrailing: boolean;
} {
	const tokens = splitArr(raw).filter((t) => t.length > 0);
	const hadUnpairedTrailing = tokens.length % 2 === 1;
	const pairs: Array<{ lastName: string; firstName: string }> = [];
	for (let i = 0; i + 1 < tokens.length; i += 2) {
		pairs.push({ lastName: tokens[i], firstName: tokens[i + 1] });
	}
	return { pairs, hadUnpairedTrailing };
}

// -------- Report shape --------

type RowDiff = {
	rowNumber: number; // 1-based, header is row 1
	email: string;
	role: 'client' | 'candidate';
	patch: Record<string, unknown>; // top-level fields-to-change summary
	locationPatch?: Record<string, unknown>; // client-only
	companyPatch?: Record<string, unknown>; // client-only
	disciplines?: Array<{
		disciplineName: string;
		disciplineId: string;
		preferredHourlyMin: number | null;
		preferredHourlyMax: number | null;
		experienceLevelId: string | null;
		experienceLabel: string | null;
	}>;
	blacklistInserts?: Array<{
		candidateName: string;
		candidateId: string | null;
		resolved: boolean;
	}>;
	skippedColumns?: Record<string, string>; // letter → value
	warnings?: string[]; // per-row non-fatal issues (e.g. malformed SSN, no-op fields)
	wouldQueueGeocode?: boolean; // dry-run: marks rows whose address changed
};

type Report = {
	args: Args;
	startedAt: string;
	finishedAt?: string;
	mode: 'dry-run' | 'commit';
	csvRowCount: number;
	resolution: {
		disciplines: Array<{ csv: string; db: string; via: string }>;
		experienceLevels: Array<{ csv: string; db: string | null; via: string }>;
		unresolvedDisciplines: string[];
		unresolvedExperienceLevels: string[];
	};
	counts: {
		applied: number;
		wouldApply: number;
		missingUsers: number;
		missingProfiles: number;
		errored: number;
		skippedNoChanges: number;
	};
	applied: RowDiff[]; // (commit) actually written
	wouldApply: RowDiff[]; // (dry-run) what we would write
	missingUsers: Array<{ rowNumber: number; email: string; role: string }>;
	missingProfiles: Array<{ rowNumber: number; email: string; role: string }>;
	errored: Array<{ rowNumber: number; email: string; reason: string }>;
	skippedNoChanges: Array<{ rowNumber: number; email: string }>;
	blacklistNotFound: Array<{
		rowNumber: number;
		clientEmail: string;
		companyName: string | null;
		candidateName: string;
		reason: 'no-match' | 'multiple-matches';
	}>;
};

// -------- Main --------

async function main() {
	const args = parseArgs();
	console.log(
		`\nbackfill-csv-import — mode=${args.commit ? 'COMMIT' : 'DRY-RUN'} limit-per-role=${args.limitPerRole}\n` +
			`  csv:    ${args.csv}\n` +
			`  report: ${args.report}\n`
	);

	if (!existsSync(args.csv)) {
		throw new Error(`CSV not found at: ${args.csv}`);
	}

	const csvText = readFileSync(args.csv, 'utf8');
	const rows = parse(csvText, {
		columns: true,
		skip_empty_lines: true,
		trim: false, // we trim per-field; preserve raw whitespace until we decide
		bom: true
	}) as CsvRow[];

	console.log(`Parsed ${rows.length} data rows.`);

	// Header sanity check
	const firstRow = rows[0];
	if (!firstRow) throw new Error('CSV has no data rows');
	const missingHeaders = EXPECTED_HEADERS.filter(
		(h) => !(h in firstRow)
	);
	if (missingHeaders.length > 0) {
		throw new Error(
			`CSV is missing expected headers: ${missingHeaders.join(', ')}\n` +
				`Got headers: ${Object.keys(firstRow).join(', ')}`
		);
	}

	// -------- Reconciliation (always against ALL rows, regardless of limit) --------
	const uniqueDisciplines = new Set<string>();
	const uniqueExpLevels = new Set<string>();
	for (const row of rows) {
		const role = classifyRole(row['Security Group(s)']);
		if (role !== 'candidate') continue;
		for (const d of splitArr(row['Discipline Type'])) {
			if (d) uniqueDisciplines.add(d);
		}
		for (const e of splitArr(row['Experience Level'])) {
			if (e) uniqueExpLevels.add(e);
		}
	}

	// Fetch DB lookup tables once
	const allDisciplines = await db
		.select({
			id: disciplineTable.id,
			name: disciplineTable.name,
			abbreviation: disciplineTable.abbreviation
		})
		.from(disciplineTable);
	const allExpLevels = await db
		.select({ id: experienceLevelTable.id, value: experienceLevelTable.value })
		.from(experienceLevelTable);

	// Resolve every distinct CSV name. If anything is unresolved, abort BEFORE
	// touching any data.
	const resolution: Report['resolution'] = {
		disciplines: [],
		experienceLevels: [],
		unresolvedDisciplines: [],
		unresolvedExperienceLevels: []
	};

	const disciplineIdByCsv = new Map<string, string>(); // csv exact value → db id
	for (const csvName of [...uniqueDisciplines].sort()) {
		const key = norm(csvName);
		// Layer 1: exact name (normalized)
		let hit = allDisciplines.find((d) => norm(d.name) === key);
		let via: string = hit ? 'exact name' : '';
		// Layer 1b: exact abbreviation
		if (!hit) {
			hit = allDisciplines.find((d) => norm(d.abbreviation) === key);
			if (hit) via = 'abbreviation';
		}
		// Layer 2: alias map → DB name
		if (!hit && DISCIPLINE_ALIASES[key]) {
			const aliasedName = DISCIPLINE_ALIASES[key];
			hit = allDisciplines.find((d) => norm(d.name) === norm(aliasedName));
			if (hit) via = `alias → "${aliasedName}"`;
		}
		if (hit) {
			disciplineIdByCsv.set(csvName, hit.id);
			resolution.disciplines.push({ csv: csvName, db: hit.name, via });
		} else {
			resolution.unresolvedDisciplines.push(csvName);
			resolution.disciplines.push({ csv: csvName, db: '(unresolved)', via: '' });
		}
	}

	const expLevelIdByCsv = new Map<string, string | null>(); // null = no-op
	for (const csvVal of [...uniqueExpLevels].sort()) {
		const key = norm(csvVal);
		if (EXPERIENCE_NOOP.has(key)) {
			expLevelIdByCsv.set(csvVal, null);
			resolution.experienceLevels.push({ csv: csvVal, db: null, via: 'no-op (leave untouched)' });
			continue;
		}
		// Layer 1: alias (explicit override — wins over exact match. Required so
		// CSV "No Preference" maps to "0-2 Years" instead of matching the literal
		// "No Preference" DB row, which is reserved for requisition filters.)
		let hit;
		let via = '';
		if (EXPERIENCE_ALIASES[key]) {
			const target = EXPERIENCE_ALIASES[key];
			hit = allExpLevels.find((e) => norm(e.value) === norm(target));
			if (hit) via = `alias → "${target}"`;
		}
		// Layer 2: exact value
		if (!hit) {
			hit = allExpLevels.find((e) => norm(e.value) === key);
			if (hit) via = 'exact value';
		}
		if (hit) {
			expLevelIdByCsv.set(csvVal, hit.id);
			resolution.experienceLevels.push({ csv: csvVal, db: hit.value, via });
		} else {
			resolution.unresolvedExperienceLevels.push(csvVal);
			resolution.experienceLevels.push({ csv: csvVal, db: '(unresolved)', via: '' });
		}
	}

	// Print resolution table
	console.log('DISCIPLINE RESOLUTION:');
	for (const r of resolution.disciplines) {
		console.log(`  CSV "${r.csv}"  →  DB "${r.db}"  (${r.via || 'NONE'})`);
	}
	console.log('EXPERIENCE-LEVEL RESOLUTION:');
	for (const r of resolution.experienceLevels) {
		console.log(`  CSV "${r.csv}"  →  DB ${r.db === null ? '(no-op)' : `"${r.db}"`}  (${r.via})`);
	}
	console.log('');

	if (
		resolution.unresolvedDisciplines.length > 0 ||
		resolution.unresolvedExperienceLevels.length > 0
	) {
		const ud = resolution.unresolvedDisciplines.join(', ');
		const ue = resolution.unresolvedExperienceLevels.join(', ');
		console.error(
			`\n❌ PREFLIGHT FAILED — unresolved name(s) in CSV.\n` +
				(ud ? `   Disciplines:  ${ud}\n` : '') +
				(ue ? `   Experience:   ${ue}\n` : '') +
				`\nEdit DISCIPLINE_ALIASES / EXPERIENCE_ALIASES in this script and re-run.\n` +
				`No data was written.\n`
		);
		// Still write a report so the team can review
		await writeReport(args, {
			args,
			startedAt: new Date().toISOString(),
			mode: args.commit ? 'commit' : 'dry-run',
			csvRowCount: rows.length,
			resolution,
			counts: {
				applied: 0,
				wouldApply: 0,
				missingUsers: 0,
				missingProfiles: 0,
				errored: 0,
				skippedNoChanges: 0
			},
			applied: [],
			wouldApply: [],
			missingUsers: [],
			missingProfiles: [],
			errored: [],
			skippedNoChanges: [],
			blacklistNotFound: []
		});
		process.exit(2);
	}

	// -------- Select rows to process (limit-per-role / --only) --------
	const selected: Array<{ rowNumber: number; row: CsvRow; role: 'client' | 'candidate' }> = [];
	const onlySet = args.only ? new Set(args.only) : null;
	let clientsTaken = 0;
	let candidatesTaken = 0;
	rows.forEach((row, idx) => {
		const role = classifyRole(row['Security Group(s)']);
		if (role === 'unknown') return;
		const emailLc = (row['Email'] ?? '').trim().toLowerCase();
		if (!emailLc) return; // no key to look up
		if (onlySet) {
			if (!onlySet.has(emailLc)) return;
		} else if (args.limitPerRole > 0) {
			if (role === 'client' && clientsTaken >= args.limitPerRole) return;
			if (role === 'candidate' && candidatesTaken >= args.limitPerRole) return;
		}
		selected.push({ rowNumber: idx + 2, row, role });
		if (role === 'client') clientsTaken++;
		else candidatesTaken++;
	});

	console.log(
		`Selected ${selected.length} rows for processing (${clientsTaken} clients, ${candidatesTaken} candidates).`
	);

	// -------- Process rows --------
	const report: Report = {
		args,
		startedAt: new Date().toISOString(),
		mode: args.commit ? 'commit' : 'dry-run',
		csvRowCount: rows.length,
		resolution,
		counts: {
				applied: 0,
				wouldApply: 0,
				missingUsers: 0,
				missingProfiles: 0,
				errored: 0,
				skippedNoChanges: 0
			},
		applied: [],
		wouldApply: [],
		missingUsers: [],
		missingProfiles: [],
		errored: [],
		skippedNoChanges: [],
		blacklistNotFound: []
	};

	for (const { rowNumber, row, role } of selected) {
		try {
			const emailLc = row['Email'].trim().toLowerCase();
			const [user] = await db
				.select()
				.from(userTable)
				.where(eq(userTable.email, emailLc))
				.limit(1);

			if (!user) {
				report.missingUsers.push({ rowNumber, email: emailLc, role });
				report.counts.missingUsers++;
				continue;
			}

			let diff: RowDiff | 'missing-profile' | null = null;
			if (role === 'candidate') {
				diff = await processCandidateRow({
					rowNumber,
					row,
					user,
					disciplineIdByCsv,
					expLevelIdByCsv,
					commit: args.commit,
					statusOnly: args.statusOnly
				});
			} else {
				diff = await processClientRow({
					rowNumber,
					row,
					user,
					commit: args.commit,
					statusOnly: args.statusOnly,
					blacklistNotFound: report.blacklistNotFound
				});
			}

			if (diff === 'missing-profile') {
				report.missingProfiles.push({ rowNumber, email: emailLc, role });
				report.counts.missingProfiles++;
				continue;
			}

			if (!diff) {
				report.skippedNoChanges.push({ rowNumber, email: emailLc });
				report.counts.skippedNoChanges++;
				continue;
			}

			if (args.commit) {
				report.applied.push(diff);
				report.counts.applied++;
			} else {
				report.wouldApply.push(diff);
				report.counts.wouldApply++;
			}
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			report.errored.push({
				rowNumber,
				email: (row['Email'] ?? '').toLowerCase(),
				reason
			});
			report.counts.errored++;
			console.error(`Row ${rowNumber} errored: ${reason}`);
		}
	}

	report.finishedAt = new Date().toISOString();
	await writeReport(args, report);

	console.log(
		`\nDone. ${args.commit ? 'Applied' : 'Would apply'}: ${
			args.commit ? report.counts.applied : report.counts.wouldApply
		}, missing-users: ${report.counts.missingUsers}, missing-profiles: ${
			report.counts.missingProfiles
		}, no-changes: ${report.counts.skippedNoChanges}, errored: ${report.counts.errored}.`
	);
	console.log(`Report: ${args.report}`);

	if (report.counts.errored > 0) process.exit(1);
}

function classifyRole(securityGroup: string | undefined): 'client' | 'candidate' | 'unknown' {
	const v = norm(securityGroup);
	if (v === 'client') return 'client';
	if (v === 'candidate') return 'candidate';
	return 'unknown';
}

async function writeReport(args: Args, report: Report) {
	mkdirSync(dirname(args.report), { recursive: true });
	writeFileSync(args.report, JSON.stringify(report, null, 2));
}

// -------- Row processors (stubs — implemented next) --------

type ProcessCandidateInput = {
	rowNumber: number;
	row: CsvRow;
	user: typeof userTable.$inferSelect;
	disciplineIdByCsv: Map<string, string>;
	expLevelIdByCsv: Map<string, string | null>;
	commit: boolean;
	statusOnly: boolean;
};

async function processCandidateRow(
	input: ProcessCandidateInput
): Promise<RowDiff | 'missing-profile' | null> {
	const { rowNumber, row, user, disciplineIdByCsv, expLevelIdByCsv, commit, statusOnly } = input;

	// Look up the candidate profile by the user's id. If they don't have one
	// yet (shouldn't happen per "all users in DB"), surface as an error.
	const [profile] = await db
		.select()
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.userId, user.id))
		.limit(1);
	if (!profile) {
		return 'missing-profile';
	}

	// --- Status-only follow-up pass ---
	// Short-circuit everything else: only write candidate_profiles.status when the
	// CSV says ACTIVE/INACTIVE. DENIED is sticky (admin set it deliberately, the
	// source-of-truth CSV shouldn't undo that). Rows whose CSV Status is blank or
	// non-matching land in skippedNoChanges so the reviewer can tally them.
	if (statusOnly) {
		if (profile.status === 'DENIED') return null;
		const newStatus = mapCsvStatus(row['Status']);
		if (newStatus === null) return null;
		if (newStatus === profile.status) return null;

		const diff: RowDiff = {
			rowNumber,
			email: user.email,
			role: 'candidate',
			patch: { status: newStatus }
		};

		if (commit) {
			await runWithRetry(async () => {
				await db
					.update(candidateProfileTable)
					.set({ status: newStatus, updatedAt: new Date() })
					.where(eq(candidateProfileTable.id, profile.id));
			});
		}
		return diff;
	}

	// --- Profile patch (only fields that have a CSV value) ---
	// Phone routing: Cell Phone (N) wins, fall back to Home Phone (L) if N is blank.
	const phoneRaw = nonBlank(row['Cell Phone']) ?? nonBlank(row['Home Phone']);
	const phone = phoneRaw ? normalizeUSPhone(phoneRaw) : null;

	const profilePatch: Record<string, unknown> = {};
	const warnings: string[] = [];
	const dobIso = parseUSDate(row['Date of Birth']);
	if (dobIso) profilePatch.birthday = dobIso;
	if (phone) profilePatch.cellPhone = phone;

	// UIN (column K) → candidate_profiles.puid (integer, NOT NULL, UNIQUE).
	// Overwrite existing value when CSV has a parseable positive integer; blank → leave alone.
	// Non-numeric or non-positive errors the row so a human can reconcile.
	const uinRaw = nonBlank(row['UIN']);
	if (uinRaw) {
		const uin = parseInt(uinRaw, 10);
		if (!Number.isFinite(uin) || uin <= 0 || String(uin) !== uinRaw.trim()) {
			throw new Error(`Malformed UIN "${uinRaw}" for ${user.email} — expected positive integer`);
		}
		profilePatch.puid = uin;
	}

	// SSN (column O) → candidate_profiles.ssnLast4. Last 4 digits only; <4 digits → skip + warn.
	const ssnRaw = nonBlank(row['SSN']);
	if (ssnRaw) {
		const digits = ssnRaw.replace(/\D+/g, '');
		if (digits.length >= 4) {
			profilePatch.ssnLast4 = digits.slice(-4);
		} else {
			warnings.push(`SSN "${ssnRaw}" has <4 digits — ssnLast4 not updated`);
		}
	}

	// Address writes are *only* performed when the candidate has no existing
	// address data on the profile — empty completeAddress AND null lat/lon/geom.
	// If any of those are populated, we leave all address fields alone (per user:
	// "we are ONLY doing location changes if there is no completeAddress, lat/lon,
	// and geom for a candidate"). Phone, name, puid, ssn, disciplines, etc. still apply.
	const existingHasAddress =
		!!nonBlank(profile.completeAddress) || profile.lat !== null || profile.lon !== null || profile.geom !== null;

	let composedAddress: string | null = null;
	let addressChanged = false;
	if (existingHasAddress) {
		if (
			nonBlank(row['Address (Street 1)']) ||
			nonBlank(row['City']) ||
			nonBlank(row['State']) ||
			nonBlank(row['Zip Code'])
		) {
			warnings.push('Address skipped — candidate already has completeAddress/lat/lon/geom');
		}
	} else {
		const street1 = nonBlank(row['Address (Street 1)']);
		const street2 = nonBlank(row['Address (Street 2)']);
		const city = nonBlank(row['City']);
		const state = nonBlank(row['State']);
		const zip = nonBlank(row['Zip Code']);
		if (street1) profilePatch.address = street1;
		if (city) profilePatch.city = city;
		if (state) profilePatch.state = state;
		if (zip) profilePatch.zipcode = zip;
		// completeAddress: only populate if we have at least street1 + city + state.
		if (street1 && city && state) {
			composedAddress = [street1, street2, city, state, zip].filter(Boolean).join(', ');
			profilePatch.completeAddress = composedAddress;
			// addressChanged stays true here because existing was null/empty.
			addressChanged = true;
		}
	}

	// --- User patch (firstName / lastName only — names occasionally differ) ---
	const userPatch: Record<string, unknown> = {};
	const csvFirst = nonBlank(row['First Name']);
	const csvLast = nonBlank(row['Last Name']);
	if (csvFirst && csvFirst !== user.firstName) userPatch.firstName = csvFirst;
	if (csvLast && csvLast !== user.lastName) userPatch.lastName = csvLast;

	// --- Disciplines (parallel arrays from V, Y, Z) ---
	const vArr = splitArr(row['Discipline Type']);
	const yArr = splitArr(row['Rate of Pay']);
	const zArr = splitArr(row['Experience Level']);
	// V is canonical; pad Y/Z to match.
	while (yArr.length < vArr.length) yArr.push('');
	while (zArr.length < vArr.length) zArr.push('');

	const seenDisciplineIds = new Set<string>();
	const disciplineDiffs: NonNullable<RowDiff['disciplines']> = [];
	const disciplineUpserts: Array<{
		disciplineId: string;
		preferredHourlyMin: number | null;
		preferredHourlyMax: number | null;
		experienceLevelId: string | null;
	}> = [];

	for (let i = 0; i < vArr.length; i++) {
		const dName = vArr[i];
		if (!dName) continue; // empty slot
		const disciplineId = disciplineIdByCsv.get(dName);
		if (!disciplineId) {
			// Preflight should have caught this; defensive only.
			throw new Error(`Discipline "${dName}" not in resolution map (row ${rowNumber})`);
		}
		if (seenDisciplineIds.has(disciplineId)) continue; // dedupe duplicates like "Assistant,Assistant"
		seenDisciplineIds.add(disciplineId);

		const rateRaw = yArr[i] ?? '';
		const expRaw = zArr[i] ?? '';
		const minNum = nonBlank(rateRaw) ? parseInt(rateRaw, 10) : null;
		const min = minNum !== null && !Number.isNaN(minNum) ? minNum : null;
		const max = min !== null ? min + 5 : null;
		const expId = expRaw && expLevelIdByCsv.has(expRaw) ? (expLevelIdByCsv.get(expRaw) ?? null) : null;

		disciplineDiffs.push({
			disciplineName: dName,
			disciplineId,
			preferredHourlyMin: min,
			preferredHourlyMax: max,
			experienceLevelId: expId,
			experienceLabel: expRaw || null
		});
		disciplineUpserts.push({
			disciplineId,
			preferredHourlyMin: min,
			preferredHourlyMax: max,
			experienceLevelId: expId
		});
	}

	const skippedColumns: Record<string, string> = {};
	for (const [letter, header] of [
		['W', 'Travel Radius'],
		['X', 'Desired Assignment Duration']
	] as const) {
		const v = nonBlank(row[header as (typeof EXPECTED_HEADERS)[number]]);
		if (v) skippedColumns[letter] = v;
	}

	const hasProfileChanges = Object.keys(profilePatch).length > 0;
	const hasUserChanges = Object.keys(userPatch).length > 0;
	const hasDisciplineChanges = disciplineUpserts.length > 0;
	if (!hasProfileChanges && !hasUserChanges && !hasDisciplineChanges) {
		return null; // skip "no changes"
	}

	const diff: RowDiff = {
		rowNumber,
		email: user.email,
		role: 'candidate',
		patch: { ...userPatch, ...profilePatch },
		disciplines: disciplineDiffs.length > 0 ? disciplineDiffs : undefined,
		skippedColumns: Object.keys(skippedColumns).length > 0 ? skippedColumns : undefined,
		warnings: warnings.length > 0 ? warnings : undefined,
		wouldQueueGeocode: addressChanged || undefined
	};

	if (commit) {
		await runWithRetry(async () => {
			await db.transaction(async (tx) => {
				if (hasUserChanges) {
					await tx
						.update(userTable)
						.set({ ...userPatch, updatedAt: new Date() })
						.where(eq(userTable.id, user.id));
				}
				if (hasProfileChanges) {
					await tx
						.update(candidateProfileTable)
						.set({ ...profilePatch, updatedAt: new Date() })
						.where(eq(candidateProfileTable.id, profile.id));
				}
				for (const u of disciplineUpserts) {
					// candidate_discipline_experience PK is (candidateId, disciplineId).
					// Build patch with only fields we actually want to set; preserve
					// existing values for fields we don't have data for. To match
					// "leave existing alone for blanks", use ON CONFLICT DO UPDATE
					// only on fields we know.
					const insertValues: typeof candidateDisciplineExperienceTable.$inferInsert = {
						candidateId: profile.id,
						disciplineId: u.disciplineId,
						// preferredHourly{Min,Max} are NOT NULL with default 0 in the schema.
						// On insert we must provide a value; default to 0 if we don't know.
						preferredHourlyMin: u.preferredHourlyMin ?? 0,
						preferredHourlyMax: u.preferredHourlyMax ?? 0,
						// experienceLevelId is NOT NULL. If we don't have one from the
						// CSV, we can't safely insert a new row — skip those.
						experienceLevelId: u.experienceLevelId ?? '',
						createdAt: new Date(),
						updatedAt: new Date()
					};
					// On conflict: only update fields the CSV gave us.
					const onUpdate: Record<string, unknown> = { updatedAt: new Date() };
					if (u.preferredHourlyMin !== null) onUpdate.preferredHourlyMin = u.preferredHourlyMin;
					if (u.preferredHourlyMax !== null) onUpdate.preferredHourlyMax = u.preferredHourlyMax;
					if (u.experienceLevelId !== null) onUpdate.experienceLevelId = u.experienceLevelId;

					if (u.experienceLevelId === null) {
						// We can't insert without an experienceLevelId. Only update if
						// a row already exists (skip insert path).
						const [existing] = await tx
							.select({ candidateId: candidateDisciplineExperienceTable.candidateId })
							.from(candidateDisciplineExperienceTable)
							.where(
								and(
									eq(candidateDisciplineExperienceTable.candidateId, profile.id),
									eq(candidateDisciplineExperienceTable.disciplineId, u.disciplineId)
								)
							)
							.limit(1);
						if (!existing) {
							// No existing row, no exp level → can't safely materialize.
							// Skip this discipline; it'll show in the diff but not in DB.
							continue;
						}
						await tx
							.update(candidateDisciplineExperienceTable)
							.set(onUpdate)
							.where(
								and(
									eq(candidateDisciplineExperienceTable.candidateId, profile.id),
									eq(candidateDisciplineExperienceTable.disciplineId, u.disciplineId)
								)
							);
					} else {
						await tx
							.insert(candidateDisciplineExperienceTable)
							.values(insertValues)
							.onConflictDoUpdate({
								target: [
									candidateDisciplineExperienceTable.candidateId,
									candidateDisciplineExperienceTable.disciplineId
								],
								set: onUpdate
							});
					}
				}
			});
		});
		// Tx committed — queue geocoding outside the tx so a queue hiccup can't roll
		// back the write. Only when the composed address actually changed. Dynamic
		// import keeps mapbox.ts (which depends on $env) out of dry-run's module graph.
		if (addressChanged && composedAddress) {
			const { geocodingQueue } = await import('../geocode-queue');
			geocodingQueue.addJobs([
				{
					candidateId: profile.id,
					address: composedAddress,
					email: user.email,
					type: 'candidate'
				}
			]);
		}
	}

	return diff;
}

type ProcessClientInput = {
	rowNumber: number;
	row: CsvRow;
	user: typeof userTable.$inferSelect;
	commit: boolean;
	statusOnly: boolean;
	blacklistNotFound: Report['blacklistNotFound'];
};

async function processClientRow(
	input: ProcessClientInput
): Promise<RowDiff | 'missing-profile' | null> {
	const { rowNumber, row, user, commit, statusOnly, blacklistNotFound } = input;

	const [profile] = await db
		.select()
		.from(clientProfileTable)
		.where(eq(clientProfileTable.userId, user.id))
		.limit(1);
	if (!profile) {
		return 'missing-profile';
	}

	// --- Status-only follow-up pass --- (see candidate processor for full notes)
	if (statusOnly) {
		if (profile.status === 'DENIED') return null;
		const newStatus = mapCsvStatus(row['Status']);
		if (newStatus === null) return null;
		if (newStatus === profile.status) return null;

		const diff: RowDiff = {
			rowNumber,
			email: user.email,
			role: 'client',
			patch: { status: newStatus }
		};

		if (commit) {
			await runWithRetry(async () => {
				await db
					.update(clientProfileTable)
					.set({ status: newStatus, updatedAt: new Date() })
					.where(eq(clientProfileTable.id, profile.id));
			});
		}
		return diff;
	}

	const [company] = await db
		.select()
		.from(clientCompanyTable)
		.where(eq(clientCompanyTable.clientId, profile.id))
		.limit(1);

	// --- User patch ---
	const userPatch: Record<string, unknown> = {};
	const csvFirst = nonBlank(row['First Name']);
	const csvLast = nonBlank(row['Last Name']);
	if (csvFirst && csvFirst !== user.firstName) userPatch.firstName = csvFirst;
	if (csvLast && csvLast !== user.lastName) userPatch.lastName = csvLast;

	// --- Profile patch ---
	// Phone: prefer Cell Phone (N), fall back to Home Phone (L).
	const phoneRaw = nonBlank(row['Cell Phone']) ?? nonBlank(row['Home Phone']);
	const phone = phoneRaw ? normalizeUSPhone(phoneRaw) : null;

	const profilePatch: Record<string, unknown> = {};
	const dobIso = parseUSDate(row['Date of Birth']);
	if (dobIso) profilePatch.birthday = dobIso;
	if (phone) profilePatch.cellPhone = phone;

	// --- Company patch ---
	const companyPatch: Record<string, unknown> = {};
	const csvCompanyName = nonBlank(row['Company Name']);
	if (company && csvCompanyName && csvCompanyName !== company.companyName) {
		companyPatch.companyName = csvCompanyName;
	}
	// EIN (Q) → client_companies.einNumber. Write trimmed value as-is; preserves "XX-XXXXXXX" formatting.
	const einRaw = nonBlank(row['EIN #']);
	if (company && einRaw && einRaw !== company.einNumber) {
		companyPatch.einNumber = einRaw;
	}
	// U → client_companies.accountableManager. Trimmed value as-is.
	const managerRaw = nonBlank(row['Office/Accountable Manager']);
	if (company && managerRaw && managerRaw !== company.accountableManager) {
		companyPatch.accountableManager = managerRaw;
	}

	// Location updates intentionally skipped on client rows (per user decision):
	// columns E/F/G/H/I (address) and M (company phone) are not written to
	// `company_office_locations` here; no location geocoding is queued.

	// --- Blacklist parse (AC) ---
	// Client row → list of candidates the client has blacklisted.
	const blacklistInserts: NonNullable<RowDiff['blacklistInserts']> = [];
	const blacklistResolvedRows: Array<{ candidateId: string; companyId: string }> = [];
	if (company) {
		const { pairs, hadUnpairedTrailing } = parseLastFirstPairs(row['Blacklist']);
		if (hadUnpairedTrailing) {
			console.warn(
				`Row ${rowNumber} (${user.email}): odd token count in Blacklist column — dropped trailing token`
			);
		}
		for (const { firstName, lastName } of pairs) {
			// Lookup candidate by case-insensitive name match.
			const matches = await db
				.select({
					userId: userTable.id,
					candidateId: candidateProfileTable.id,
					firstName: userTable.firstName,
					lastName: userTable.lastName
				})
				.from(userTable)
				.innerJoin(candidateProfileTable, eq(candidateProfileTable.userId, userTable.id))
				.where(
					and(
						eq(userTable.role, 'CANDIDATE'),
						ilike(userTable.firstName, firstName),
						ilike(userTable.lastName, lastName)
					)
				);
			const candidateName = `${lastName}, ${firstName}`;
			if (matches.length === 0) {
				blacklistInserts.push({ candidateName, candidateId: null, resolved: false });
				blacklistNotFound.push({
					rowNumber,
					clientEmail: user.email,
					companyName: company.companyName ?? null,
					candidateName,
					reason: 'no-match'
				});
				continue;
			}
			if (matches.length > 1) {
				blacklistInserts.push({ candidateName, candidateId: null, resolved: false });
				blacklistNotFound.push({
					rowNumber,
					clientEmail: user.email,
					companyName: company.companyName ?? null,
					candidateName,
					reason: 'multiple-matches'
				});
				continue;
			}
			const m = matches[0];
			blacklistInserts.push({ candidateName, candidateId: m.candidateId, resolved: true });
			blacklistResolvedRows.push({ candidateId: m.candidateId, companyId: company.id });
		}
	}

	// No skipped columns remain on client rows — Q and U are now written above.

	const hasUserChanges = Object.keys(userPatch).length > 0;
	const hasProfileChanges = Object.keys(profilePatch).length > 0;
	const hasCompanyChanges = Object.keys(companyPatch).length > 0;
	const hasBlacklistInserts = blacklistResolvedRows.length > 0;
	if (
		!hasUserChanges &&
		!hasProfileChanges &&
		!hasCompanyChanges &&
		!hasBlacklistInserts
	) {
		return null;
	}

	const diff: RowDiff = {
		rowNumber,
		email: user.email,
		role: 'client',
		patch: { ...userPatch, ...profilePatch },
		companyPatch: hasCompanyChanges ? companyPatch : undefined,
		blacklistInserts: blacklistInserts.length > 0 ? blacklistInserts : undefined
	};

	if (commit) {
		await runWithRetry(async () => {
			await db.transaction(async (tx) => {
				if (hasUserChanges) {
					await tx
						.update(userTable)
						.set({ ...userPatch, updatedAt: new Date() })
						.where(eq(userTable.id, user.id));
				}
				if (hasProfileChanges) {
					await tx
						.update(clientProfileTable)
						.set({ ...profilePatch, updatedAt: new Date() })
						.where(eq(clientProfileTable.id, profile.id));
				}
				if (hasCompanyChanges && company) {
					await tx
						.update(clientCompanyTable)
						.set({ ...companyPatch, updatedAt: new Date() })
						.where(eq(clientCompanyTable.id, company.id));
				}
				for (const bl of blacklistResolvedRows) {
					await tx
						.insert(candidateBlacklistTable)
						.values({ candidateId: bl.candidateId, companyId: bl.companyId })
						.onConflictDoNothing();
				}
			});
		});
	}

	return diff;
}

// -------- Retry helper --------

const TRANSIENT_PG_CODES = new Set([
	'40001', // serialization_failure
	'40P01', // deadlock_detected
	'57014', // query_canceled
	'08000', // connection_exception
	'08003', // connection_does_not_exist
	'08006' // connection_failure
]);

async function runWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
	let lastErr: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			const code = (err as { code?: string } | null)?.code;
			if (!code || !TRANSIENT_PG_CODES.has(code)) throw err;
			const delay = 200 * Math.pow(2, i);
			console.warn(`Transient error (${code}); retrying in ${delay}ms (attempt ${i + 1}/${attempts})`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastErr;
}

// -------- Boot --------

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('Backfill script crashed:', err);
		process.exit(1);
	});
