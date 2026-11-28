/**
 * Shifts by location × local day (10 §3.2, §4.1): the admin coverage board and the
 * practice's upcoming shifts read the same rows, scoped by the required scope.
 */
import { and, asc, eq, gte, inArray, isNull, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable, companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { recurrenceDayTable, requisitionTable, workdayTable } from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import type { CoverageShift, DashboardScope } from '../types';

/** Requisition-level scope: company + locations. [] → nothing; the DTSS scope → everything. */
export function requisitionScope(scope: DashboardScope): SQL | undefined | false {
	if (scope.kind === 'all') return undefined;
	if (!scope.companyId) return false;
	if (Array.isArray(scope.locationIds) && scope.locationIds.length === 0) return false;
	return and(
		eq(requisitionTable.companyId, scope.companyId),
		Array.isArray(scope.locationIds) ? inArray(requisitionTable.locationId, scope.locationIds) : undefined
	);
}

/** Temp shifts on `days` (local dates, inclusive), with the booked professional if any. */
export async function shiftsOnDays(scope: DashboardScope, days: string[]): Promise<CoverageShift[]> {
	const scoped = requisitionScope(scope);
	if (scoped === false || days.length === 0) return [];

	const rows = await db
		.select({
			id: recurrenceDayTable.id,
			requisitionId: requisitionTable.id,
			locationId: requisitionTable.locationId,
			locationName: companyOfficeLocationTable.name,
			companyName: clientCompanyTable.companyName,
			date: recurrenceDayTable.date,
			dayStart: recurrenceDayTable.dayStart,
			dayEnd: recurrenceDayTable.dayEnd,
			timezone: requisitionTable.referenceTimezone,
			status: recurrenceDayTable.status,
			disciplineName: disciplineTable.name,
			proFirstName: userTable.firstName,
			proLastName: userTable.lastName
		})
		.from(recurrenceDayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
		.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.leftJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.leftJoin(companyOfficeLocationTable, eq(companyOfficeLocationTable.id, requisitionTable.locationId))
		.leftJoin(
			workdayTable,
			and(eq(workdayTable.recurrenceDayId, recurrenceDayTable.id), isNull(workdayTable.cancelledAt))
		)
		.leftJoin(candidateProfileTable, eq(candidateProfileTable.id, workdayTable.candidateId))
		.leftJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(
			and(
				eq(recurrenceDayTable.archived, false),
				eq(requisitionTable.permanentPosition, false),
				sql`coalesce(${requisitionTable.archived}, false) = false`,
				notInArray(requisitionTable.status, ['CANCELED']),
				inArray(recurrenceDayTable.status, ['OPEN', 'FILLED', 'UNFULFILLED']),
				gte(recurrenceDayTable.date, days[0]),
				lte(recurrenceDayTable.date, days[days.length - 1]),
				scoped
			)
		)
		.orderBy(asc(recurrenceDayTable.dayStart));

	// One row per shift even if a stray second live workday exists.
	const seen = new Set<string>();
	const out: CoverageShift[] = [];
	for (const r of rows) {
		if (seen.has(r.id)) continue;
		seen.add(r.id);
		const name = [r.proFirstName, r.proLastName].filter(Boolean).join(' ');
		out.push({
			id: r.id,
			requisitionId: r.requisitionId,
			locationId: r.locationId,
			locationName: r.locationName ?? 'Unknown location',
			companyName: r.companyName ?? 'Unknown practice',
			date: String(r.date),
			dayStart: r.dayStart,
			dayEnd: r.dayEnd,
			timezone: r.timezone,
			status: r.status,
			disciplineName: r.disciplineName,
			professionalName: r.status === 'FILLED' && name ? name : null
		});
	}
	return out;
}
