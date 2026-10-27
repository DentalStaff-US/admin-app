/**
 * Read side of the public, anonymous job board (/api/public/jobs/*).
 *
 * "Publishable" is one predicate shared by every query here, so the list, the
 * facets, the detail page and the candidate-app resolver can never disagree on
 * whether a posting is live:
 *
 *   requisition OPEN, not archived, owning business ACTIVE, and
 *     - permanent: nothing more, or
 *     - temp: at least one open day — today or later in the requisition's own
 *       timezone, not archived, not CANCELED/UNFULFILLED/FILLED, and with no
 *       live (non-cancelled) workday on it. Mirrors the candidate temp board
 *       (api/external/getTempRequisitionsForCandidate).
 *
 * Every select names its columns. Rows go through mask.ts before leaving.
 */
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, notInArray, or, sql, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import {
	recurrenceDayTable,
	requisitionTable,
	workdayTable
} from '$lib/server/database/schemas/requisition';
import { disciplineTable, experienceLevelTable } from '$lib/server/database/schemas/skill';
import { clientIsActiveCondition } from '$lib/server/clientStatusGuards';
import { METERS_PER_MILE } from '$lib/config/constants';
import { getSkillRequirementsForDisplay } from '$lib/server/skills/requisitionSkills';
import {
	toPublicJob,
	toPublicJobDetail,
	type OpenDayRow,
	type PublicJob,
	type PublicJobDetail,
	type PublicJobRow
} from './mask';

export const DEFAULT_RADIUS_MILES = 25;
export const MAX_RADIUS_MILES = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

const CLOSED_DAY_STATUSES = ['CANCELED', 'UNFULFILLED', 'FILLED'] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPublicId(value: string | null | undefined): value is string {
	return !!value && UUID_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const optionalId = z.string().trim().min(1).max(64).optional();

/**
 * Query-string filters. Out-of-range radius/limit are clamped rather than
 * rejected — a marketing page shouldn't 400 because someone typed limit=500.
 */
export const filtersSchema = z
	.object({
		discipline: optionalId,
		type: z.enum(['temp', 'perm']).optional(),
		state: z
			.string()
			.trim()
			.regex(/^[a-zA-Z]{2}$/, 'state must be a 2-letter code')
			.transform((s) => s.toUpperCase())
			.optional(),
		city: z
			.string()
			.trim()
			.min(1)
			.max(80)
			.transform((s) => s.toLowerCase())
			.optional(),
		lat: z.coerce.number().min(-90).max(90).optional(),
		lng: z.coerce.number().min(-180).max(180).optional(),
		radius: z.coerce
			.number()
			.positive()
			.transform((v) => Math.min(v, MAX_RADIUS_MILES))
			.default(DEFAULT_RADIUS_MILES),
		experienceLevel: optionalId,
		sort: z.enum(['newest', 'soonest']).default('newest'),
		page: z.coerce.number().int().min(1).default(1),
		limit: z.coerce
			.number()
			.int()
			.min(1)
			.transform((v) => Math.min(v, MAX_PAGE_SIZE))
			.default(DEFAULT_PAGE_SIZE)
	})
	.refine((f) => (f.lat === undefined) === (f.lng === undefined), {
		message: 'lat and lng must be supplied together',
		path: ['lat']
	});

export type PublicJobFilters = z.infer<typeof filtersSchema>;

/** URLSearchParams → validated filters. Empty params are treated as absent. */
export function parseFilters(searchParams: URLSearchParams) {
	const raw: Record<string, string> = {};
	for (const [key, value] of searchParams) {
		if (value.trim() !== '') raw[key] = value;
	}
	return filtersSchema.safeParse(raw);
}

// ---------------------------------------------------------------------------
// The publishable predicate
// ---------------------------------------------------------------------------

/** Correlated to the outer `requisitions` row: an open, future, unclaimed day. */
const openDayWhere = sql`${recurrenceDayTable.requisitionId} = ${requisitionTable.id}
	AND ${recurrenceDayTable.archived} = false
	AND ${recurrenceDayTable.status} NOT IN ('CANCELED', 'UNFULFILLED', 'FILLED')
	AND ${recurrenceDayTable.date} >= (now() AT TIME ZONE ${requisitionTable.referenceTimezone})::date
	AND NOT EXISTS (
		SELECT 1 FROM ${workdayTable}
		WHERE ${workdayTable.recurrenceDayId} = ${recurrenceDayTable.id}
		AND ${workdayTable.cancelledAt} IS NULL
	)`;

const hasOpenDay = sql`EXISTS (SELECT 1 FROM ${recurrenceDayTable} WHERE ${openDayWhere})`;

const firstOpenDateExpr = sql<
	string | null
>`(SELECT min(${recurrenceDayTable.date})::text FROM ${recurrenceDayTable} WHERE ${openDayWhere})`;

/**
 * Requires `clientProfileTable` to be joined (via client_companies) — the same
 * contract as `clientIsActiveCondition`.
 */
export const publishableCondition = and(
	eq(requisitionTable.status, 'OPEN'),
	eq(requisitionTable.archived, false),
	clientIsActiveCondition,
	or(
		eq(requisitionTable.permanentPosition, true),
		and(eq(requisitionTable.permanentPosition, false), hasOpenDay)
	)
)!;

function searchPoint(filters: PublicJobFilters): SQL | null {
	if (filters.lat === undefined || filters.lng === undefined) return null;
	return sql`ST_SetSRID(ST_MakePoint(${filters.lng}::float, ${filters.lat}::float), 4326)::geography`;
}

/** Filter terms on top of `publishableCondition`. Exported for tests. */
export function buildFilterConditions(filters: PublicJobFilters): SQL[] {
	const conditions: SQL[] = [publishableCondition];

	if (filters.discipline) conditions.push(eq(requisitionTable.disciplineId, filters.discipline));
	if (filters.type === 'perm') conditions.push(eq(requisitionTable.permanentPosition, true));
	if (filters.type === 'temp') conditions.push(eq(requisitionTable.permanentPosition, false));
	// state is canonicalised to 2-letter upper case at write time (normalizeState).
	if (filters.state) conditions.push(eq(companyOfficeLocationTable.state, filters.state));
	// lower(city) to hit company_office_locations_city_idx.
	if (filters.city) {
		conditions.push(sql`lower(${companyOfficeLocationTable.city}) = ${filters.city}`);
	}

	// Reductive, like candidate matching: a visitor at level N sees postings that
	// ask for level N or below, plus "No Preference" (NULL) postings.
	if (filters.experienceLevel) {
		conditions.push(
			sql`(${requisitionTable.experienceLevelId} IS NULL OR ${experienceLevelTable.order} <= (
				SELECT el."order" FROM ${experienceLevelTable} el WHERE el.id = ${filters.experienceLevel}
			))`
		);
	}

	const point = searchPoint(filters);
	if (point) {
		const meters = filters.radius * METERS_PER_MILE;
		conditions.push(
			and(
				isNotNull(companyOfficeLocationTable.geom),
				sql`ST_DWithin(${companyOfficeLocationTable.geom}::geography, ${point}, ${meters})`
			)!
		);
	}

	return conditions;
}

// ---------------------------------------------------------------------------
// Row selection
// ---------------------------------------------------------------------------

function rowColumns(point: SQL | null) {
	return {
		requisitionId: requisitionTable.id,
		publicId: requisitionTable.publicId,
		permanent: requisitionTable.permanentPosition,
		disciplineName: disciplineTable.name,
		disciplineAbbreviation: disciplineTable.abbreviation,
		experienceLevel: experienceLevelTable.value,
		city: companyOfficeLocationTable.city,
		state: companyOfficeLocationTable.state,
		hourlyRate: requisitionTable.hourlyRate,
		createdAt: requisitionTable.createdAt,
		referenceTimezone: requisitionTable.referenceTimezone,
		jobDescription: requisitionTable.jobDescription,
		distanceMiles: point
			? sql<
					number | null
				>`ST_Distance(${companyOfficeLocationTable.geom}::geography, ${point}) / ${METERS_PER_MILE}`
			: sql<number | null>`NULL::float`,
		// Scrub inputs only — mask.ts never copies these into the DTO.
		companyName: clientCompanyTable.companyName,
		companyWebsite: clientCompanyTable.website,
		locationName: companyOfficeLocationTable.name,
		locationWebsite: companyOfficeLocationTable.website,
		streetOne: companyOfficeLocationTable.streetOne,
		streetTwo: companyOfficeLocationTable.streetTwo
	};
}

type SelectedRow = PublicJobRow & { requisitionId: number };

/** One query for every open day of every temp req on the page (no N+1). */
async function getOpenDaysByRequisition(requisitionIds: number[]) {
	const out = new Map<number, OpenDayRow[]>();
	if (requisitionIds.length === 0) return out;

	const days = await db
		.select({
			requisitionId: recurrenceDayTable.requisitionId,
			date: recurrenceDayTable.date,
			dayStart: recurrenceDayTable.dayStart,
			dayEnd: recurrenceDayTable.dayEnd
		})
		.from(recurrenceDayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
		.where(
			and(
				inArray(recurrenceDayTable.requisitionId, requisitionIds),
				eq(recurrenceDayTable.archived, false),
				notInArray(recurrenceDayTable.status, [...CLOSED_DAY_STATUSES]),
				sql`${recurrenceDayTable.date} >= (now() AT TIME ZONE ${requisitionTable.referenceTimezone})::date`,
				sql`NOT EXISTS (
					SELECT 1 FROM ${workdayTable}
					WHERE ${workdayTable.recurrenceDayId} = ${recurrenceDayTable.id}
					AND ${workdayTable.cancelledAt} IS NULL
				)`
			)
		)
		.orderBy(
			asc(recurrenceDayTable.requisitionId),
			asc(recurrenceDayTable.date),
			asc(recurrenceDayTable.dayStart)
		);

	for (const day of days) {
		if (day.requisitionId == null) continue;
		const list = out.get(day.requisitionId) ?? [];
		list.push({ date: day.date, dayStart: day.dayStart, dayEnd: day.dayEnd });
		out.set(day.requisitionId, list);
	}
	return out;
}

async function loadExtras(rows: SelectedRow[]) {
	const tempIds = rows.filter((r) => r.permanent !== true).map((r) => r.requisitionId);
	const [openDays, skills] = await Promise.all([
		getOpenDaysByRequisition(tempIds),
		getSkillRequirementsForDisplay(rows.map((r) => r.requisitionId))
	]);
	return { openDays, skills };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PublicJobList = { jobs: PublicJob[]; total: number; page: number; limit: number };

export async function listPublicJobs(filters: PublicJobFilters): Promise<PublicJobList> {
	const point = searchPoint(filters);
	const where = and(...buildFilterConditions(filters));

	const orderBy =
		filters.sort === 'soonest'
			? // Temp by earliest open date; perm (no date) after, newest first.
				[
					sql`${firstOpenDateExpr} ASC NULLS LAST`,
					desc(requisitionTable.createdAt),
					desc(requisitionTable.id)
				]
			: [desc(requisitionTable.createdAt), desc(requisitionTable.id)];

	const [countRows, rows] = await Promise.all([
		db
			.select({ total: sql<number>`count(*)::int` })
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(companyOfficeLocationTable.id, requisitionTable.locationId)
			)
			.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.leftJoin(
				experienceLevelTable,
				eq(experienceLevelTable.id, requisitionTable.experienceLevelId)
			)
			.where(where),
		db
			.select(rowColumns(point))
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(companyOfficeLocationTable.id, requisitionTable.locationId)
			)
			.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.leftJoin(
				experienceLevelTable,
				eq(experienceLevelTable.id, requisitionTable.experienceLevelId)
			)
			.where(where)
			.orderBy(...orderBy)
			.limit(filters.limit)
			.offset((filters.page - 1) * filters.limit)
	]);

	const selected = rows as SelectedRow[];
	const { openDays, skills } = await loadExtras(selected);

	return {
		jobs: selected.map((row) =>
			toPublicJob(row, {
				openDays: openDays.get(row.requisitionId),
				skills: skills.get(row.requisitionId),
				includeDistance: point !== null
			})
		),
		total: Number(countRows[0]?.total ?? 0),
		page: filters.page,
		limit: filters.limit
	};
}

/** Detail for a publishable posting, or null (unknown OR no longer live). */
export async function getPublicJob(publicId: string): Promise<PublicJobDetail | null> {
	if (!isPublicId(publicId)) return null;

	const [row] = (await db
		.select(rowColumns(null))
		.from(requisitionTable)
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.innerJoin(
			companyOfficeLocationTable,
			eq(companyOfficeLocationTable.id, requisitionTable.locationId)
		)
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.leftJoin(experienceLevelTable, eq(experienceLevelTable.id, requisitionTable.experienceLevelId))
		.where(and(eq(requisitionTable.publicId, publicId), publishableCondition))
		.limit(1)) as SelectedRow[];

	if (!row) return null;

	const { openDays, skills } = await loadExtras([row]);
	return toPublicJobDetail(row, {
		openDays: openDays.get(row.requisitionId),
		skills: skills.get(row.requisitionId)
	});
}

export type PublicJobFacets = {
	disciplines: { id: string; name: string; abbreviation: string; openCount: number }[];
	experienceLevels: { id: string; value: string; order: number }[];
	states: { state: string; count: number }[];
	cities: { city: string; state: string | null; count: number }[];
};

const MAX_CITY_FACETS = 200;

export async function getPublicJobFacets(): Promise<PublicJobFacets> {
	const [disciplines, experienceLevels, states, cities] = await Promise.all([
		db
			.select({
				id: disciplineTable.id,
				name: disciplineTable.name,
				abbreviation: disciplineTable.abbreviation,
				openCount: sql<number>`count(${requisitionTable.id})::int`
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.where(publishableCondition)
			.groupBy(disciplineTable.id, disciplineTable.name, disciplineTable.abbreviation)
			.orderBy(asc(disciplineTable.name)),
		// The whole scale, not just levels in use: the filter is reductive
		// ("this level or below"), so every rung is a meaningful choice.
		db
			.select({
				id: experienceLevelTable.id,
				value: experienceLevelTable.value,
				order: experienceLevelTable.order
			})
			.from(experienceLevelTable)
			.orderBy(asc(experienceLevelTable.order)),
		db
			.select({
				state: companyOfficeLocationTable.state,
				count: sql<number>`count(${requisitionTable.id})::int`
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(companyOfficeLocationTable.id, requisitionTable.locationId)
			)
			.where(and(publishableCondition, isNotNull(companyOfficeLocationTable.state)))
			.groupBy(companyOfficeLocationTable.state)
			.orderBy(asc(companyOfficeLocationTable.state)),
		db
			.select({
				// City has no canonical stored form — group on lower() and show one spelling.
				city: sql<string>`min(${companyOfficeLocationTable.city})`,
				state: companyOfficeLocationTable.state,
				count: sql<number>`count(${requisitionTable.id})::int`
			})
			.from(requisitionTable)
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
			.innerJoin(
				companyOfficeLocationTable,
				eq(companyOfficeLocationTable.id, requisitionTable.locationId)
			)
			.where(and(publishableCondition, isNotNull(companyOfficeLocationTable.city)))
			.groupBy(sql`lower(${companyOfficeLocationTable.city})`, companyOfficeLocationTable.state)
			.orderBy(
				sql`count(${requisitionTable.id}) DESC`,
				sql`min(${companyOfficeLocationTable.city})`
			)
			.limit(MAX_CITY_FACETS)
	]);

	return {
		disciplines,
		experienceLevels,
		states: states.filter((s): s is { state: string; count: number } => !!s.state),
		cities
	};
}

export type ResolvedPublicJob = {
	requisitionId: number;
	permanent: boolean;
	firstOpenDate: string | null;
	open: boolean;
};

/**
 * For the candidate app: turn a public id from a marketing-site link into the
 * internal requisition id. Found-but-closed postings return `open: false` so
 * the candidate app can say "this position has been filled" instead of 404ing.
 */
export async function resolvePublicJob(publicId: string): Promise<ResolvedPublicJob | null> {
	if (!isPublicId(publicId)) return null;

	const [row] = await db
		.select({
			requisitionId: requisitionTable.id,
			permanent: requisitionTable.permanentPosition,
			// Left joins below: a missing client profile must read as closed, not vanish.
			open: sql<boolean>`coalesce((${publishableCondition}), false)`,
			firstOpenDate: firstOpenDateExpr
		})
		.from(requisitionTable)
		.leftJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.leftJoin(clientProfileTable, eq(clientProfileTable.id, clientCompanyTable.clientId))
		.where(eq(requisitionTable.publicId, publicId))
		.limit(1);

	if (!row) return null;

	const permanent = row.permanent === true;
	return {
		requisitionId: row.requisitionId,
		permanent,
		firstOpenDate: permanent ? null : (row.firstOpenDate ?? null),
		open: row.open === true
	};
}
