/**
 * Read side of the ledger. Rows are shaped for the ActivityLog component: the
 * actor is rendered from the write-time snapshot first (so deleted/renamed
 * users still show as they were), falling back to the live users row for
 * legacy rows written before snapshots existed.
 */
import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { actionHistoryTable } from '$lib/server/database/schemas/admin';
import { userTable } from '$lib/server/database/schemas/auth';
import { alias } from 'drizzle-orm/pg-core';

import type { ActivityEntry } from '$lib/audit/constants';
export type { ActivityEntry };

const impersonator = alias(userTable, 'impersonator');

const selection = {
	id: actionHistoryTable.id,
	createdAt: actionHistoryTable.createdAt,
	action: actionHistoryTable.action,
	entityType: actionHistoryTable.entityType,
	entityId: actionHistoryTable.entityId,
	userId: actionHistoryTable.userId,
	actorRole: actionHistoryTable.actorRole,
	actorSnapshot: actionHistoryTable.actorSnapshot,
	impersonatedBy: actionHistoryTable.impersonatedBy,
	source: actionHistoryTable.source,
	ipAddress: actionHistoryTable.ipAddress,
	userAgent: actionHistoryTable.userAgent,
	requestPath: actionHistoryTable.requestPath,
	metadata: actionHistoryTable.metadata,
	changes: actionHistoryTable.changes,
	liveFirstName: userTable.firstName,
	liveLastName: userTable.lastName,
	liveEmail: userTable.email,
	impersonatorFirstName: impersonator.firstName,
	impersonatorLastName: impersonator.lastName
};

type RawRow = Awaited<ReturnType<typeof baseQuery>>[number];

function joinName(first?: string | null, last?: string | null): string | null {
	const name = [first, last].filter(Boolean).join(' ').trim();
	return name || null;
}

function shape(row: RawRow): ActivityEntry {
	const snap = row.actorSnapshot;
	return {
		id: row.id,
		createdAt: row.createdAt,
		action: row.action,
		entityType: row.entityType,
		entityId: row.entityId,
		userId: row.userId,
		actorName:
			joinName(snap?.firstName, snap?.lastName) ?? joinName(row.liveFirstName, row.liveLastName),
		actorEmail: snap?.email ?? row.liveEmail ?? null,
		actorRole: row.actorRole,
		impersonatedBy: row.impersonatedBy,
		impersonatorName: joinName(row.impersonatorFirstName, row.impersonatorLastName),
		source: row.source,
		ipAddress: row.ipAddress,
		userAgent: row.userAgent,
		requestPath: row.requestPath,
		metadata: row.metadata ?? null,
		changes: row.changes ?? null
	};
}

function baseQuery() {
	return db
		.select(selection)
		.from(actionHistoryTable)
		.leftJoin(userTable, eq(actionHistoryTable.userId, userTable.id))
		.leftJoin(impersonator, eq(actionHistoryTable.impersonatedBy, impersonator.id));
}

/**
 * Timeline for one entity, newest first. `relatedKey` also pulls rows whose
 * metadata points at this entity — e.g. `'timesheetId'` brings in the expense
 * rows under a timesheet, `'requisitionId'` brings in the workday/application
 * rows under a requisition.
 */
export async function getActivityForEntity(
	entityType: string,
	entityId: string,
	opts: { limit?: number; relatedKey?: 'timesheetId' | 'requisitionId' } = {}
): Promise<ActivityEntry[]> {
	const limit = opts.limit ?? 200;
	const direct = and(
		eq(actionHistoryTable.entityType, entityType),
		eq(actionHistoryTable.entityId, entityId)
	);
	const where = opts.relatedKey
		? or(direct, eq(sql`${actionHistoryTable.metadata}->>${opts.relatedKey}`, entityId))
		: direct;

	const rows = await baseQuery()
		.where(where)
		.orderBy(desc(actionHistoryTable.createdAt))
		.limit(limit);
	return rows.map(shape);
}

export type ActionHistoryFilters = {
	search?: string;
	startDate?: string;
	endDate?: string;
	entityType?: string;
	action?: string;
	role?: string;
	source?: string;
};

/** Paginated feed for the superadmin Record History page. */
export async function getActionHistoryPage(
	filters: ActionHistoryFilters,
	{ page, pageSize }: { page: number; pageSize: number }
): Promise<{ rows: ActivityEntry[]; total: number; page: number; pageSize: number }> {
	const conditions: SQL[] = [];

	const searchTerm = filters.search?.trim();
	if (searchTerm) {
		const words = searchTerm.split(/\s+/);
		const fieldMatches = [
			ilike(actionHistoryTable.entityType, `%${searchTerm}%`),
			ilike(actionHistoryTable.entityId, `%${searchTerm}%`),
			ilike(actionHistoryTable.action, `%${searchTerm}%`),
			ilike(actionHistoryTable.ipAddress, `%${searchTerm}%`),
			ilike(userTable.email, `%${searchTerm}%`),
			ilike(sql`${actionHistoryTable.actorSnapshot}->>'email'`, `%${searchTerm}%`)
		];
		if (words.length >= 2) {
			const [first, ...rest] = words;
			const last = rest.join(' ');
			conditions.push(
				or(
					and(ilike(userTable.firstName, `%${first}%`), ilike(userTable.lastName, `%${last}%`)),
					and(ilike(userTable.lastName, `%${first}%`), ilike(userTable.firstName, `%${last}%`)),
					...fieldMatches
				)!
			);
		} else {
			conditions.push(
				or(
					ilike(userTable.firstName, `%${searchTerm}%`),
					ilike(userTable.lastName, `%${searchTerm}%`),
					ilike(sql`${actionHistoryTable.actorSnapshot}->>'firstName'`, `%${searchTerm}%`),
					ilike(sql`${actionHistoryTable.actorSnapshot}->>'lastName'`, `%${searchTerm}%`),
					...fieldMatches
				)!
			);
		}
	}
	if (filters.startDate) {
		conditions.push(gte(actionHistoryTable.createdAt, new Date(filters.startDate)));
	}
	if (filters.endDate) {
		const end = new Date(filters.endDate);
		end.setHours(23, 59, 59, 999);
		conditions.push(lte(actionHistoryTable.createdAt, end));
	}
	if (filters.entityType) conditions.push(eq(actionHistoryTable.entityType, filters.entityType));
	if (filters.action) conditions.push(eq(actionHistoryTable.action, filters.action));
	if (filters.role) conditions.push(eq(actionHistoryTable.actorRole, filters.role));
	if (filters.source) conditions.push(eq(actionHistoryTable.source, filters.source));

	const where = conditions.length ? and(...conditions) : undefined;

	const [rows, [{ total }]] = await Promise.all([
		baseQuery()
			.where(where)
			.orderBy(desc(actionHistoryTable.createdAt))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db
			.select({ total: count() })
			.from(actionHistoryTable)
			.leftJoin(userTable, eq(actionHistoryTable.userId, userTable.id))
			.where(where)
	]);

	return { rows: rows.map(shape), total: Number(total), page, pageSize };
}
