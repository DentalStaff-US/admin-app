/**
 * Server half of the Requests list. The existing tenancy-scoped queries
 * (getRequisitionsAdmin / getRequisitionsForClient) still decide WHICH rows a
 * caller sees; this adds what the new columns need: each request's live days
 * with their status (fill progress) and, for permanent requests, how many
 * people are in the running.
 */
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	recurrenceDayTable,
	requisitionApplicationTable
} from '$lib/server/database/schemas/requisition';
import type { ListDay, ListRow } from '../requestList';

/** What the role-scoped list queries return (nullable joins included). */
type BaseRow = {
	id: number;
	title: string | null;
	status: string;
	createdAt: Date;
	hourlyRate: number | null;
	permanentPosition: boolean | null;
	referenceTimezone: string;
	locationId: string;
	locationName: string | null;
	companyId: string;
	companyName: string | null;
	disciplineName: string | null;
	unbilled?: boolean;
};

export async function withListDetails(rows: BaseRow[]): Promise<ListRow[]> {
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const permIds = rows.filter((r) => r.permanentPosition).map((r) => r.id);

	const [days, applicants] = await Promise.all([
		db
			.select({
				requisitionId: recurrenceDayTable.requisitionId,
				dayStart: recurrenceDayTable.dayStart,
				dayEnd: recurrenceDayTable.dayEnd,
				status: recurrenceDayTable.status
			})
			.from(recurrenceDayTable)
			.where(
				and(inArray(recurrenceDayTable.requisitionId, ids), eq(recurrenceDayTable.archived, false))
			),
		permIds.length
			? db
					.select({ requisitionId: requisitionApplicationTable.requisitionId, n: count() })
					.from(requisitionApplicationTable)
					.where(
						and(
							inArray(requisitionApplicationTable.requisitionId, permIds),
							ne(requisitionApplicationTable.status, 'DENIED')
						)
					)
					.groupBy(requisitionApplicationTable.requisitionId)
			: Promise.resolve([] as { requisitionId: number; n: number }[])
	]);

	const daysBy = new Map<number, ListDay[]>();
	for (const d of days) {
		if (d.requisitionId == null) continue;
		const list = daysBy.get(d.requisitionId) ?? [];
		list.push({ dayStart: d.dayStart, dayEnd: d.dayEnd, status: d.status });
		daysBy.set(d.requisitionId, list);
	}
	const applicantsBy = new Map(applicants.map((a) => [a.requisitionId, Number(a.n)]));

	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		status: r.status,
		createdAt: r.createdAt,
		hourlyRate: r.hourlyRate,
		permanentPosition: r.permanentPosition,
		referenceTimezone: r.referenceTimezone,
		locationId: r.locationId,
		locationName: r.locationName ?? '',
		companyId: r.companyId,
		companyName: r.companyName ?? '',
		disciplineName: r.disciplineName ?? '',
		unbilled: r.unbilled,
		days: daysBy.get(r.id) ?? [],
		applicantCount: r.permanentPosition ? (applicantsBy.get(r.id) ?? 0) : undefined
	}));
}
