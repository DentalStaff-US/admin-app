import { and, eq, gt } from 'drizzle-orm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import db from '$lib/server/database/drizzle';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { recurrenceDayTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { writeActionHistory } from '$lib/server/database/queries/admin';
import { logger } from '$lib/server/logger';

/**
 * `requisitions.reference_timezone` is a *snapshot* of the location's timezone
 * taken when the requisition is created (the create form posts the location's
 * zone as a hidden field). Nothing used to re-read it, so correcting a
 * location's timezone after the fact left every existing requisition — and the
 * shift times rendered from it — stuck in the wrong zone.
 *
 * This module is the single place that changes a requisition's reference zone:
 *
 *  - `syncRequisitionTimezonesForLocation` — called when a location's timezone
 *    is edited, so the fix propagates automatically from here on out.
 *  - `setRequisitionReferenceTimezone` — manual, per-requisition override for
 *    rows that were already wrong before the sync existed.
 *  - `getLocationTimezoneDrift` — surfaces those already-wrong rows so they can
 *    be re-synced in one click.
 *
 * Times are rebased **wall-clock first**: an 8:00 AM shift stays 8:00 AM in the
 * new zone and its stored UTC instant moves. That's the intent being repaired —
 * the hours were typed as the practice's local hours and only mislabelled. It
 * also keeps `timesheets.week_begin_date` (Monday-in-requisition-tz) stable,
 * since no shift's local date moves.
 *
 * Only future, non-archived recurrence days are rewritten. Past days are left
 * exactly as stored so already-worked shifts and their timesheet entries stay
 * consistent with each other; they will render at the shifted time and need a
 * manual edit if that matters.
 */

export const DEFAULT_REFERENCE_TIMEZONE = 'America/New_York';

/** Local wall-clock, timezone-naive — the form in which a shift time is "meant". */
const WALL_CLOCK_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

export type ReferenceTimezoneChange = {
	requisitionId: number;
	title: string | null;
	from: string;
	to: string;
	daysRewritten: number;
};

export type ReferenceTimezoneSyncResult = {
	timezone: string;
	requisitionsUpdated: number;
	daysRewritten: number;
	changes: ReferenceTimezoneChange[];
};

export function isValidIanaTimezone(timezone: string | null | undefined): timezone is string {
	if (!timezone) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Re-interpret an instant so its wall-clock reading is unchanged but expressed
 * in `toTz`: 13:00Z read as 8:00 AM America/New_York becomes 16:00Z, i.e. 8:00
 * AM America/Los_Angeles. Each timestamp carries its own local date, so shifts
 * that cross midnight rebase correctly.
 */
export function rebaseInstantToTimezone(value: Date, fromTz: string, toTz: string): Date {
	const wallClock = formatInTimeZone(value, fromTz, WALL_CLOCK_FORMAT);
	return fromZonedTime(wallClock, toTz);
}

function rebaseNullable(value: Date | null, fromTz: string, toTz: string): Date | null {
	return value ? rebaseInstantToTimezone(value, fromTz, toTz) : null;
}

type RequisitionRow = {
	id: number;
	title: string | null;
	referenceTimezone: string;
};

/**
 * Move one requisition (and its future shifts) onto `toTz`. Returns null when
 * it's already there. Runs inside the caller's transaction so a requisition and
 * its recurrence days never disagree.
 */
async function applyReferenceTimezone(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	requisition: RequisitionRow,
	toTz: string,
	now: Date
): Promise<ReferenceTimezoneChange | null> {
	const fromTz = requisition.referenceTimezone || DEFAULT_REFERENCE_TIMEZONE;
	if (fromTz === toTz) return null;

	await tx
		.update(requisitionTable)
		.set({ referenceTimezone: toTz, updatedAt: now })
		.where(eq(requisitionTable.id, requisition.id));

	const upcomingDays = await tx
		.select({
			id: recurrenceDayTable.id,
			dayStart: recurrenceDayTable.dayStart,
			dayEnd: recurrenceDayTable.dayEnd,
			lunchStart: recurrenceDayTable.lunchStart,
			lunchEnd: recurrenceDayTable.lunchEnd
		})
		.from(recurrenceDayTable)
		.where(
			and(
				eq(recurrenceDayTable.requisitionId, requisition.id),
				eq(recurrenceDayTable.archived, false),
				gt(recurrenceDayTable.dayStart, now)
			)
		);

	let daysRewritten = 0;

	for (const day of upcomingDays) {
		const dayStart = rebaseInstantToTimezone(day.dayStart, fromTz, toTz);
		const dayEnd = rebaseInstantToTimezone(day.dayEnd, fromTz, toTz);

		// Zones that share an offset (America/New_York vs America/Detroit) leave
		// every instant untouched — skip the write rather than churn updated_at.
		if (
			dayStart.getTime() === day.dayStart.getTime() &&
			dayEnd.getTime() === day.dayEnd.getTime()
		) {
			continue;
		}

		await tx
			.update(recurrenceDayTable)
			.set({
				dayStart,
				dayEnd,
				lunchStart: rebaseNullable(day.lunchStart, fromTz, toTz),
				lunchEnd: rebaseNullable(day.lunchEnd, fromTz, toTz),
				updatedAt: now
			})
			.where(eq(recurrenceDayTable.id, day.id));

		daysRewritten += 1;
	}

	return {
		requisitionId: requisition.id,
		title: requisition.title,
		from: fromTz,
		to: toTz,
		daysRewritten
	};
}

async function recordChanges(
	changes: ReferenceTimezoneChange[],
	actorUserId: string | null,
	trigger: 'location_sync' | 'manual_override'
) {
	for (const change of changes) {
		try {
			await writeActionHistory({
				table: 'REQUISITIONS',
				userId: actorUserId,
				action: 'UPDATE',
				entityId: change.requisitionId.toString(),
				beforeState: { referenceTimezone: change.from },
				afterState: { referenceTimezone: change.to },
				metadata: {
					trigger,
					recurrenceDaysRewritten: change.daysRewritten,
					wallClockPreserved: true
				}
			});
		} catch (err) {
			// History is best-effort — the timezone fix itself already committed.
			logger.error('failed to record reference timezone change', {
				error: err,
				requisitionId: change.requisitionId,
				distinctId: actorUserId ?? undefined
			});
		}
	}
}

/**
 * Push a location's timezone onto every non-archived requisition attached to
 * it. Call this whenever `company_office_locations.timezone` changes.
 */
export async function syncRequisitionTimezonesForLocation({
	locationId,
	timezone,
	actorUserId
}: {
	locationId: string;
	timezone: string;
	actorUserId: string | null;
}): Promise<ReferenceTimezoneSyncResult> {
	if (!isValidIanaTimezone(timezone)) {
		throw new Error(`Invalid IANA timezone: ${timezone}`);
	}

	const now = new Date();

	const changes = await db.transaction(async (tx) => {
		const requisitions = await tx
			.select({
				id: requisitionTable.id,
				title: requisitionTable.title,
				referenceTimezone: requisitionTable.referenceTimezone
			})
			.from(requisitionTable)
			.where(
				and(eq(requisitionTable.locationId, locationId), eq(requisitionTable.archived, false))
			);

		const applied: ReferenceTimezoneChange[] = [];
		for (const requisition of requisitions) {
			const change = await applyReferenceTimezone(tx, requisition, timezone, now);
			if (change) applied.push(change);
		}
		return applied;
	});

	await recordChanges(changes, actorUserId, 'location_sync');

	return {
		timezone,
		requisitionsUpdated: changes.length,
		daysRewritten: changes.reduce((sum, change) => sum + change.daysRewritten, 0),
		changes
	};
}

/**
 * Manual, per-requisition correction — the escape hatch for requisitions that
 * were already wrong before the location sync existed (re-saving the location
 * is a no-op once its own timezone is already correct).
 */
export async function setRequisitionReferenceTimezone({
	requisitionId,
	timezone,
	actorUserId
}: {
	requisitionId: number;
	timezone: string;
	actorUserId: string | null;
}): Promise<ReferenceTimezoneChange | null> {
	if (!isValidIanaTimezone(timezone)) {
		throw new Error(`Invalid IANA timezone: ${timezone}`);
	}

	const now = new Date();

	const change = await db.transaction(async (tx) => {
		const [requisition] = await tx
			.select({
				id: requisitionTable.id,
				title: requisitionTable.title,
				referenceTimezone: requisitionTable.referenceTimezone
			})
			.from(requisitionTable)
			.where(eq(requisitionTable.id, requisitionId));

		if (!requisition) {
			throw new Error(`Requisition ${requisitionId} not found`);
		}

		return applyReferenceTimezone(tx, requisition, timezone, now);
	});

	if (change) {
		await recordChanges([change], actorUserId, 'manual_override');
	}

	return change;
}

/**
 * Non-archived requisitions at this location whose reference zone disagrees
 * with the location's own — i.e. rows created before the sync existed. Drives
 * the "resync" prompt on the location page.
 */
export async function getLocationTimezoneDrift(locationId: string): Promise<{
	locationTimezone: string;
	requisitions: { id: number; title: string | null; referenceTimezone: string }[];
}> {
	const [location] = await db
		.select({ timezone: companyOfficeLocationTable.timezone })
		.from(companyOfficeLocationTable)
		.where(eq(companyOfficeLocationTable.id, locationId));

	const locationTimezone = location?.timezone || DEFAULT_REFERENCE_TIMEZONE;

	const requisitions = await db
		.select({
			id: requisitionTable.id,
			title: requisitionTable.title,
			referenceTimezone: requisitionTable.referenceTimezone
		})
		.from(requisitionTable)
		.where(and(eq(requisitionTable.locationId, locationId), eq(requisitionTable.archived, false)));

	return {
		locationTimezone,
		requisitions: requisitions.filter(
			(requisition) =>
				(requisition.referenceTimezone || DEFAULT_REFERENCE_TIMEZONE) !== locationTimezone
		)
	};
}
