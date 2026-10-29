/**
 * The public job-board DTO. This is an ALLOWLIST: every field is copied by name
 * from the query row, never spread, so a column added to `requisitions`,
 * `client_companies` or `company_office_locations` cannot start leaking to
 * anonymous visitors.
 *
 * Never emitted: coordinates, zip, street, location name/id, company
 * name/id/logo/website, requisition title (client-authored, routinely the
 * practice name), special instructions, PO number, the serial requisition id.
 * The identity columns that ARE selected (company name, street, …) exist only
 * so the description scrub knows what to remove.
 */
import { formatInTimeZone } from 'date-fns-tz';
import { roundDistanceMiles } from '$lib/server/privacy/clientIdentity';
import type { SkillRequirementDisplay } from '$lib/server/skills/requisitionSkills';
import { scrubPublicDescription } from './scrub';
import { buildPublicJobSummary } from './summary';

export type PublicJobDate = { date: string; start: string; end: string };

export type PublicJobSchedule =
	| { permanent: false; openDateCount: number; nextDates: PublicJobDate[] }
	| { permanent: true };

export type PublicJobSkillGroup = {
	category: string;
	matchMode: 'ALL' | 'ANY';
	skills: { name: string; requiresCertificate: boolean }[];
};

export type PublicJob = {
	publicId: string;
	type: 'temp' | 'perm';
	discipline: { name: string; abbreviation: string };
	experienceLevel: string | null;
	city: string | null;
	state: string | null;
	distanceMiles: number | null;
	payRate: number | null;
	schedule: PublicJobSchedule;
	skills: PublicJobSkillGroup[];
	postedAt: string;
	summary: string;
	descriptionTeaser: string | null;
};

export type PublicJobDetail = PublicJob & { descriptionLength: number };

/** Shape the queries select. Identity columns are scrub inputs only. */
export type PublicJobRow = {
	publicId: string;
	permanent: boolean | null;
	disciplineName: string;
	disciplineAbbreviation: string;
	experienceLevel: string | null;
	city: string | null;
	state: string | null;
	hourlyRate: number | null;
	createdAt: Date;
	referenceTimezone: string;
	jobDescription: string | null;
	distanceMiles: number | null;
	// scrub inputs — never copied to the DTO
	companyName: string | null;
	companyWebsite: string | null;
	locationName: string | null;
	locationWebsite: string | null;
	streetOne: string | null;
	streetTwo: string | null;
};

export type OpenDayRow = { date: string; dayStart: Date | string; dayEnd: Date | string };

export type PublicJobExtras = {
	/** Every open, future, unclaimed day for the requisition, ascending. */
	openDays?: OpenDayRow[];
	skills?: SkillRequirementDisplay[];
	/** Only true when the caller supplied a search point. */
	includeDistance?: boolean;
};

export const NEXT_DATES_LIMIT = 5;

function formatTime(value: Date | string, timezone: string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (isNaN(date.getTime())) return '';
	try {
		return formatInTimeZone(date, timezone, 'HH:mm');
	} catch {
		return formatInTimeZone(date, 'America/New_York', 'HH:mm');
	}
}

/** "TAMPA" / "tampa" → "Tampa"; mixed-case input is left alone. */
function displayCity(city: string | null): string | null {
	const trimmed = city?.trim();
	if (!trimmed) return null;
	if (trimmed !== trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()) return trimmed;
	return trimmed
		.toLowerCase()
		.replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function toPostedAt(createdAt: Date | string): string {
	const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
	return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function toSkillGroups(skills: SkillRequirementDisplay[] | undefined): PublicJobSkillGroup[] {
	return (skills ?? []).map((group) => ({
		category: group.categoryName,
		matchMode: group.matchMode,
		skills: group.skills.map((s) => ({ name: s.name, requiresCertificate: s.requiresCertificate }))
	}));
}

function knownIdentity(row: PublicJobRow) {
	return {
		companyName: row.companyName,
		locationName: row.locationName,
		streetOne: row.streetOne,
		streetTwo: row.streetTwo,
		website: [row.companyWebsite, row.locationWebsite]
	};
}

export function toPublicJob(row: PublicJobRow, extras: PublicJobExtras = {}): PublicJob {
	const permanent = row.permanent === true;
	const city = displayCity(row.city);
	const state = row.state?.trim().toUpperCase() || null;
	const openDays = extras.openDays ?? [];

	const schedule: PublicJobSchedule = permanent
		? { permanent: true }
		: {
				permanent: false,
				openDateCount: openDays.length,
				nextDates: openDays.slice(0, NEXT_DATES_LIMIT).map((day) => ({
					date: String(day.date).slice(0, 10),
					start: formatTime(day.dayStart, row.referenceTimezone),
					end: formatTime(day.dayEnd, row.referenceTimezone)
				}))
			};

	const teaser = scrubPublicDescription(row.jobDescription, knownIdentity(row));

	return {
		publicId: row.publicId,
		type: permanent ? 'perm' : 'temp',
		discipline: { name: row.disciplineName, abbreviation: row.disciplineAbbreviation },
		experienceLevel: row.experienceLevel ?? null,
		city,
		state,
		distanceMiles: extras.includeDistance ? roundDistanceMiles(row.distanceMiles) : null,
		// Perm rate semantics differ from temp hourly (and aren't billed hourly), so
		// a perm posting never advertises a number.
		payRate: permanent ? null : (row.hourlyRate ?? null),
		schedule,
		skills: toSkillGroups(extras.skills),
		postedAt: toPostedAt(row.createdAt),
		summary: buildPublicJobSummary({
			permanent,
			disciplineName: row.disciplineName,
			city,
			state,
			experienceLevel: row.experienceLevel,
			openDateCount: openDays.length,
			firstOpenDate: openDays[0]?.date ?? null
		}),
		descriptionTeaser: teaser
	};
}

/** Detail view: same allowlist plus a length hint. Still only the teaser. */
export function toPublicJobDetail(
	row: PublicJobRow,
	extras: PublicJobExtras = {}
): PublicJobDetail {
	const full = scrubPublicDescription(row.jobDescription, knownIdentity(row), {
		maxLength: Infinity
	});
	return { ...toPublicJob(row, extras), descriptionLength: full?.length ?? 0 };
}
