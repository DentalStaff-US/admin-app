/**
 * Async readers and writers for professional availability.
 *
 * ./availability.ts is the authority for every predicate; this file only talks to
 * the database. The one exception is getUnavailabilityForCandidates below, which
 * re-expresses the weekday rule in raw SQL so that N professionals x M dates costs
 * a single statement. That duplication is deliberate and load-bearing — it must
 * change whenever ./availability.ts does.
 */

import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateProfileTable,
	candidateUnavailableDateTable
} from '$lib/server/database/schemas/candidate';
import { recurrenceDayTable, workdayTable } from '$lib/server/database/schemas/requisition';
import { recordAction, type AuditActor, type DbExecutor } from '$lib/server/audit/audit';
import { todayInET } from '$lib/server/certifications/credentialStatus';
import { logger } from '$lib/server/logger';
import {
	blockedDatesWithin,
	checkAvailability,
	normalizeAvailableDays,
	MAX_BLACKOUT_DATES_PER_REQUEST,
	type AvailabilityBlockReason,
	type AvailabilitySource,
	type BlockedDate,
	type CandidateAvailabilityPattern
} from './availability';

export type AvailabilityBlackout = {
	date: string;
	note: string | null;
	source: AvailabilitySource;
};

export type AvailabilityBookedDay = {
	date: string;
	requisitionId: number;
	recurrenceDayId: string | null;
	workdayId: string;
};

export type CandidateAvailability = {
	availableDays: number[] | null;
	availableDaysUpdatedAt: Date | null;
	availableDaysSource: AvailabilitySource | null;
	blackouts: AvailabilityBlackout[];
	bookedDates: AvailabilityBookedDay[];
	/** Ready to hand straight to checkAvailability(). */
	pattern: CandidateAvailabilityPattern;
};

/**
 * Everything needed to render or evaluate one professional's availability.
 *
 * `from`/`to` scope the blackout and booked reads. They do NOT scope the weekly
 * pattern, which is unbounded by nature. There is deliberately no maximum: a
 * professional may block dates arbitrarily far ahead, so the caller passes whatever
 * window it is actually rendering.
 */
export async function getCandidateAvailability(
	candidateId: string,
	opts: { from?: string; to?: string; includeBooked?: boolean; tx?: DbExecutor } = {}
): Promise<CandidateAvailability> {
	const exec: DbExecutor = opts.tx ?? db;
	const includeBooked = opts.includeBooked ?? true;

	const [profile] = await exec
		.select({
			availableDays: candidateProfileTable.availableDays,
			availableDaysUpdatedAt: candidateProfileTable.availableDaysUpdatedAt,
			availableDaysSource: candidateProfileTable.availableDaysSource
		})
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, candidateId))
		.limit(1);

	const dateFilters = [eq(candidateUnavailableDateTable.candidateId, candidateId)];
	if (opts.from) dateFilters.push(gte(candidateUnavailableDateTable.date, opts.from));
	if (opts.to) dateFilters.push(lte(candidateUnavailableDateTable.date, opts.to));

	const blackoutRows = await exec
		.select({
			date: candidateUnavailableDateTable.date,
			note: candidateUnavailableDateTable.note,
			source: candidateUnavailableDateTable.source
		})
		.from(candidateUnavailableDateTable)
		.where(and(...dateFilters))
		.orderBy(candidateUnavailableDateTable.date);

	// The booked rule, lifted out of the two listing endpoints that each carried a
	// copy. Admin/client cancellations keep the workday row with `cancelled_at` set
	// (candidate cancels delete it) — those are NOT bookings, so a cancelled shift
	// on a date must not block every other shift that day.
	let bookedRows: AvailabilityBookedDay[] = [];
	if (includeBooked) {
		const bookedFilters = [
			eq(workdayTable.candidateId, candidateId),
			isNull(workdayTable.cancelledAt)
		];
		if (opts.from) bookedFilters.push(gte(recurrenceDayTable.date, opts.from));
		if (opts.to) bookedFilters.push(lte(recurrenceDayTable.date, opts.to));

		bookedRows = (await exec
			.select({
				date: recurrenceDayTable.date,
				requisitionId: recurrenceDayTable.requisitionId,
				recurrenceDayId: recurrenceDayTable.id,
				workdayId: workdayTable.id
			})
			.from(workdayTable)
			.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
			.where(and(...bookedFilters))
			.orderBy(recurrenceDayTable.date)) as AvailabilityBookedDay[];
	}

	const blackouts: AvailabilityBlackout[] = (
		blackoutRows as Array<{ date: string; note: string | null; source: AvailabilitySource }>
	).map((r) => ({ date: r.date, note: r.note, source: r.source }));

	return {
		availableDays: profile?.availableDays ?? null,
		availableDaysUpdatedAt: profile?.availableDaysUpdatedAt ?? null,
		availableDaysSource: profile?.availableDaysSource ?? null,
		blackouts,
		bookedDates: bookedRows,
		pattern: {
			availableDays: profile?.availableDays ?? null,
			blackoutDates: new Set(blackouts.map((b) => b.date)),
			bookedDates: new Set(bookedRows.map((b) => b.date))
		}
	};
}

/**
 * THE async gate: one professional, N dates.
 *
 * Reads only the dates asked about, so the claim path costs one small query rather
 * than loading an entire calendar.
 */
export async function checkCandidateAvailableOnDates(
	candidateId: string,
	dates: string[],
	opts: { considerBooked?: boolean; tx?: DbExecutor } = {}
): Promise<{ available: boolean; blocked: BlockedDate[] }> {
	if (!dates.length) return { available: true, blocked: [] };

	const sorted = [...dates].sort();
	const availability = await getCandidateAvailability(candidateId, {
		from: sorted[0],
		to: sorted[sorted.length - 1],
		includeBooked: opts.considerBooked ?? true,
		tx: opts.tx
	});

	const blocked = blockedDatesWithin(availability.pattern, dates, {
		considerBooked: opts.considerBooked
	});
	return { available: blocked.length === 0, blocked };
}

/**
 * Bulk unavailability for N professionals × M dates, in ONE statement.
 *
 * This is what makes the admin match-list badge and the notification blast
 * affordable. Returns only the blocked (candidateId, date) pairs — an absent entry
 * means available, keeping the default-permissive rule intact even here.
 *
 * TWO RULES IN THE SQL BELOW THAT ARE LOAD-BEARING, NOT STYLE:
 *
 * 1. `available_days IS NOT NULL AND array_length(...) > 0 AND array_length(...) < 7`
 *    guards the weekday branch. This is the same "NULL or [] means unset" defence as
 *    availability.ts and the CHECK constraint, so one bad row cannot hide anybody
 *    even through this path. Never reduce it to a bare NOT NULL check, and never
 *    express this rule with a Drizzle `inArray(expr, availableDays)` — `inArray(x,
 *    [])` renders as FALSE, which would hide every shift from every professional who
 *    has never touched availability, silently and with no error anywhere.
 *
 * 2. `EXTRACT(DOW FROM d.date)` reads a BARE DATE and must never be pointed at
 *    `day_start_time`. On a bare date the expression is computed from the calendar
 *    value and never consults the session TimeZone. On a `timestamptz` it is read
 *    through the session timezone (UTC on Railway) AND diverges from the
 *    requisition's referenceTimezone, so an 8pm Friday ET shift extracts as
 *    Saturday. This codebase has already paid for that failure class twice — see
 *    the comment on candidate_document_uploads.expiry_date and the existence of
 *    nyTodaySql in ../certifications/credentialGateSql.ts.
 *
 * DOW is 0 = Sunday .. 6 = Saturday. ISODOW is 1 = Monday .. 7 = Sunday. Stored
 * values are DOW; switching to ISODOW makes Sunday 7, which no stored value ever
 * matches, so Sundays would silently vanish for everyone with a pattern — and only
 * Sundays, so it would survive casual testing.
 */
export async function getUnavailabilityForCandidates(
	candidateIds: string[],
	dates: string[],
	opts: { considerBooked?: boolean } = {}
): Promise<Map<string, Array<{ date: string; reason: AvailabilityBlockReason }>>> {
	const result = new Map<string, Array<{ date: string; reason: AvailabilityBlockReason }>>();
	if (!candidateIds.length || !dates.length) return result;

	const considerBooked = opts.considerBooked ?? true;
	const uniqueIds = [...new Set(candidateIds)];
	const uniqueDates = [...new Set(dates)];

	const idList = sql.join(
		uniqueIds.map((id) => sql`${id}`),
		sql`, `
	);
	const dateList = sql.join(
		uniqueDates.map((d) => sql`${d}`),
		sql`, `
	);

	const rows = await db.execute(sql`
		SELECT candidate_id, date, reason FROM (
			SELECT cp.id AS candidate_id,
				to_char(d.date, 'YYYY-MM-DD') AS date,
				CASE
					WHEN cud.candidate_id IS NOT NULL THEN 'blackout'
					WHEN cp.available_days IS NOT NULL
						AND array_length(cp.available_days, 1) > 0
						AND array_length(cp.available_days, 1) < 7
						AND NOT (EXTRACT(DOW FROM d.date)::int = ANY (cp.available_days))
						THEN 'weekday'
					WHEN ${considerBooked} AND w.id IS NOT NULL THEN 'booked'
				END AS reason
			FROM candidate_profiles cp
			CROSS JOIN (SELECT unnest(ARRAY[${dateList}]::date[]) AS date) d
			LEFT JOIN candidate_unavailable_dates cud
				ON cud.candidate_id = cp.id AND cud.date = d.date
			LEFT JOIN LATERAL (
				SELECT w.id FROM workdays w
				JOIN recurrence_days rd ON rd.id = w.recurrence_day_id
				WHERE w.candidate_id = cp.id AND w.cancelled_at IS NULL AND rd.date = d.date
				LIMIT 1
			) w ON true
			WHERE cp.id = ANY (ARRAY[${idList}]::text[])
		) x WHERE reason IS NOT NULL
	`);

	for (const row of rows.rows as Array<{
		candidate_id: string;
		date: string;
		reason: AvailabilityBlockReason;
	}>) {
		const list = result.get(row.candidate_id) ?? [];
		list.push({ date: row.date, reason: row.reason });
		result.set(row.candidate_id, list);
	}
	return result;
}

export type SetWeeklyPatternResult =
	| { ok: true; before: number[] | null; after: number[] | null }
	| { ok: false; reason: 'EMPTY_PATTERN' | 'INVALID_DAY' | 'NOT_FOUND'; message: string };

/**
 * Save (or reset) a professional's weekly pattern.
 *
 * `availableDays: null` is a deliberate reset to default-available. `[]` is refused:
 * see the CHECK constraint on candidate_profiles.available_days for why.
 */
export async function setCandidateWeeklyPattern(args: {
	candidateId: string;
	availableDays: number[] | null;
	source: AvailabilitySource;
	actor?: AuditActor | string | null;
	tx?: DbExecutor;
}): Promise<SetWeeklyPatternResult> {
	const normalized = normalizeAvailableDays(args.availableDays);
	if (!normalized.ok) {
		return normalized.reason === 'EMPTY'
			? {
					ok: false,
					reason: 'EMPTY_PATTERN',
					message:
						'Pick at least one day you can work. To stop receiving shifts entirely, contact support.'
				}
			: { ok: false, reason: 'INVALID_DAY', message: 'Days must be whole numbers from 0 to 6.' };
	}

	const exec: DbExecutor = args.tx ?? db;

	const [existing] = await exec
		.select({ availableDays: candidateProfileTable.availableDays })
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, args.candidateId))
		.limit(1);

	if (!existing) {
		return { ok: false, reason: 'NOT_FOUND', message: 'Professional not found.' };
	}

	await exec
		.update(candidateProfileTable)
		.set({
			availableDays: normalized.days,
			// Stamped even on a reset, so "they have engaged with this" survives a
			// reset to default-available.
			availableDaysUpdatedAt: new Date(),
			availableDaysSource: args.source,
			updatedAt: new Date()
		})
		.where(eq(candidateProfileTable.id, args.candidateId));

	return { ok: true, before: existing.availableDays ?? null, after: normalized.days };
}

export type ReplaceBlackoutsResult =
	| {
			ok: true;
			added: string[];
			removed: string[];
			ignoredPast: string[];
			conflictsWithBooked: string[];
	  }
	| { ok: false; reason: 'WINDOW' | 'TOO_MANY' | 'BOOKED'; message: string };

/**
 * Replace this professional's blackout dates WITHIN an explicit window.
 *
 * Window-scoped rather than global, and this is the important design choice:
 *   - a global "replace all my future blackouts" lets a client that only rendered
 *     three months delete month four, admin-entered rows included
 *   - a pure {add, remove} delta is not idempotent against a double-tap and pushes
 *     diffing into every client
 * Window-scoped replacement is idempotent, preserves past rows and anything outside
 * the window, and matches a month calendar that naturally submits one month at a time.
 *
 * There is NO horizon: `to` may be any date, however far ahead. The only cap is
 * MAX_BLACKOUT_DATES_PER_REQUEST, which is a payload guard.
 */
export async function replaceCandidateBlackoutWindow(args: {
	candidateId: string;
	from: string;
	to: string;
	dates: string[];
	notes?: Record<string, string>;
	source: AvailabilitySource;
	actor?: AuditActor | string | null;
	today?: string;
	/** ADMIN only — lets staff record a historical absence honestly. */
	allowPastDate?: boolean;
	tx?: DbExecutor;
}): Promise<ReplaceBlackoutsResult> {
	const today = args.today ?? todayInET();
	const { from, to } = args;

	if (from > to) {
		return { ok: false, reason: 'WINDOW', message: 'The start date must not be after the end date.' };
	}

	const requested = [...new Set(args.dates)].sort();

	for (const date of requested) {
		if (date < from || date > to) {
			return {
				ok: false,
				reason: 'WINDOW',
				message: `${date} falls outside the window being saved (${from} to ${to}).`
			};
		}
	}

	if (requested.length > MAX_BLACKOUT_DATES_PER_REQUEST) {
		return {
			ok: false,
			reason: 'TOO_MANY',
			message: `Save at most ${MAX_BLACKOUT_DATES_PER_REQUEST} days at a time.`
		};
	}

	// A month view legitimately contains days before today. Dropping them silently
	// (and reporting it) is right; a 400 would fail the save for a reason the
	// professional can neither see nor fix.
	const ignoredPast = args.allowPastDate ? [] : requested.filter((d) => d < today);
	const keep = args.allowPastDate ? requested : requested.filter((d) => d >= today);

	const exec: DbExecutor = args.tx ?? db;

	const existingRows = await exec
		.select({ date: candidateUnavailableDateTable.date })
		.from(candidateUnavailableDateTable)
		.where(
			and(
				eq(candidateUnavailableDateTable.candidateId, args.candidateId),
				gte(candidateUnavailableDateTable.date, from),
				lte(candidateUnavailableDateTable.date, to)
			)
		);
	const existing = new Set<string>(existingRows.map((r: { date: string }) => r.date));

	// A professional blacking out a day they are booked on, without cancelling,
	// creates a silent contradiction — the client still expects them. The UI locks
	// those cells, so this is defence in depth. An ADMIN may do it: "she's out sick
	// Thursday" is exactly how a cancellation begins, and refusing it would force
	// staff to cancel first and lose the note.
	const bookedRows = keep.length
		? await exec
				.select({ date: recurrenceDayTable.date })
				.from(workdayTable)
				.innerJoin(recurrenceDayTable, eq(workdayTable.recurrenceDayId, recurrenceDayTable.id))
				.where(
					and(
						eq(workdayTable.candidateId, args.candidateId),
						isNull(workdayTable.cancelledAt),
						gte(recurrenceDayTable.date, from),
						lte(recurrenceDayTable.date, to)
					)
				)
		: [];
	const bookedSet = new Set<string>(bookedRows.map((r: { date: string }) => r.date));
	const conflictsWithBooked = keep.filter((d) => bookedSet.has(d));

	if (conflictsWithBooked.length && args.source === 'CANDIDATE') {
		return {
			ok: false,
			reason: 'BOOKED',
			message:
				'You are booked on one of those days. Cancel the shift from My Shifts first, then mark the day off.'
		};
	}

	const keepSet = new Set(keep);
	const added = keep.filter((d) => !existing.has(d));
	const removed = [...existing].filter((d) => !keepSet.has(d)).sort();

	// One scoped delete, then one upsert. The delete is ALWAYS scoped to the
	// candidate AND both window bounds — clearing a month is legal, wiping a
	// professional's whole calendar is not.
	await exec
		.delete(candidateUnavailableDateTable)
		.where(
			and(
				eq(candidateUnavailableDateTable.candidateId, args.candidateId),
				gte(candidateUnavailableDateTable.date, from),
				lte(candidateUnavailableDateTable.date, to)
			)
		);

	if (keep.length) {
		const actorId = typeof args.actor === 'string' ? args.actor : (args.actor?.id ?? null);
		await exec
			.insert(candidateUnavailableDateTable)
			.values(
				keep.map((date) => ({
					candidateId: args.candidateId,
					date,
					note: args.notes?.[date] ?? null,
					source: args.source,
					createdByUserId: actorId
				}))
			)
			// Idempotent: two concurrent saves of the same window must not error, and
			// re-saving with a new note must update it.
			.onConflictDoUpdate({
				target: [candidateUnavailableDateTable.candidateId, candidateUnavailableDateTable.date],
				set: {
					note: sql`excluded.note`,
					source: sql`excluded.source`,
					createdByUserId: sql`excluded.created_by_user_id`
				}
			});
	}

	return { ok: true, added, removed, ignoredPast, conflictsWithBooked };
}

/**
 * Save a pattern and/or a blackout window in ONE transaction with ONE audit row.
 *
 * Both external doors (the professional's and the admin's) go through here so the
 * ledger shape cannot diverge between them.
 */
export async function saveCandidateAvailability(args: {
	candidateId: string;
	availableDays?: number[] | null;
	blackouts?: {
		from: string;
		to: string;
		dates: string[];
		notes?: Record<string, string>;
	};
	source: AvailabilitySource;
	actor?: AuditActor | string | null;
	today?: string;
	allowPastDate?: boolean;
}): Promise<
	| {
			ok: true;
			availableDays: number[] | null;
			blackouts: { added: string[]; removed: string[]; ignoredPast: string[] };
			conflictsWithBooked: string[];
	  }
	| { ok: false; reason: string; message: string }
> {
	try {
		return await db.transaction(async (tx) => {
			let patternAfter: number[] | null = null;
			let patternBefore: number[] | null = null;
			let patternTouched = false;

			if (args.availableDays !== undefined) {
				const res = await setCandidateWeeklyPattern({
					candidateId: args.candidateId,
					availableDays: args.availableDays,
					source: args.source,
					actor: args.actor,
					tx
				});
				if (!res.ok) return res;
				patternBefore = res.before;
				patternAfter = res.after;
				patternTouched = true;
			} else {
				const [row] = await tx
					.select({ availableDays: candidateProfileTable.availableDays })
					.from(candidateProfileTable)
					.where(eq(candidateProfileTable.id, args.candidateId))
					.limit(1);
				patternBefore = row?.availableDays ?? null;
				patternAfter = patternBefore;
			}

			let blackoutResult = {
				added: [] as string[],
				removed: [] as string[],
				ignoredPast: [] as string[],
				conflictsWithBooked: [] as string[]
			};

			if (args.blackouts) {
				const res = await replaceCandidateBlackoutWindow({
					candidateId: args.candidateId,
					from: args.blackouts.from,
					to: args.blackouts.to,
					dates: args.blackouts.dates,
					notes: args.blackouts.notes,
					source: args.source,
					actor: args.actor,
					today: args.today,
					allowPastDate: args.allowPastDate,
					tx
				});
				if (!res.ok) return res;
				blackoutResult = {
					added: res.added,
					removed: res.removed,
					ignoredPast: res.ignoredPast,
					conflictsWithBooked: res.conflictsWithBooked
				};
			}

			await recordAction({
				tx,
				entityType: 'CANDIDATES',
				entityId: args.candidateId,
				action: 'UPDATE',
				actor: args.actor,
				before: { availableDays: patternBefore, blackoutDates: blackoutResult.removed },
				after: { availableDays: patternAfter, blackoutDates: blackoutResult.added },
				metadata: {
					// metadata.field is the established discriminator on CANDIDATES/UPDATE
					// rows, so no new audit vocabulary is needed.
					field: 'availability',
					source: args.source,
					patternTouched,
					window: args.blackouts ? { from: args.blackouts.from, to: args.blackouts.to } : undefined,
					addedDates: blackoutResult.added.length ? blackoutResult.added : undefined,
					removedDates: blackoutResult.removed.length ? blackoutResult.removed : undefined,
					ignoredPast: blackoutResult.ignoredPast.length ? blackoutResult.ignoredPast : undefined
				}
			});

			return {
				ok: true as const,
				availableDays: patternAfter,
				blackouts: {
					added: blackoutResult.added,
					removed: blackoutResult.removed,
					ignoredPast: blackoutResult.ignoredPast
				},
				conflictsWithBooked: blackoutResult.conflictsWithBooked
			};
		});
	} catch (error) {
		logger.error('saveCandidateAvailability failed', { error, distinctId: args.candidateId });
		return { ok: false, reason: 'ERROR', message: 'Could not save availability.' };
	}
}

/** Re-export so call sites need one import. */
export { checkAvailability };
