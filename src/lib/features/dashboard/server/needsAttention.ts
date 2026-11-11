/**
 * Needs attention (10 §3.1): one thin query per kind. Each builds its WHERE once
 * and runs COUNT(*) and the first N rows from it, so the chip count and the list
 * can never disagree. Rows go through the pure rules in attentionRules.ts.
 *
 * Every function takes the DashboardScope as a required argument (10 §4.2 rule 1).
 * The admin kinds require `kind: 'all'`; practices use practiceAttention.ts.
 */
import { and, asc, count, countDistinct, eq, gt, lt, min, ne, notInArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import {
	invoiceTable,
	recurrenceDayTable,
	requisitionApplicationTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { supportTicketTable } from '$lib/server/database/schemas/admin';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { unbilledPlacementCondition } from '$lib/server/requisitions/unbilled';
import type { AttentionGroup, AttentionItem, AttentionKind, DashboardScope } from '../types';
import {
	complianceItem,
	discrepancyItem,
	overdueInvoiceItem,
	pendingClientItem,
	pendingProfessionalItem,
	pendingTimesheetItem,
	permApplicantsItem,
	supportItem,
	unbilledPlacementItem,
	unfilledSoonItem,
	type ComplianceQueueRow
} from './attentionRules';
import { settle } from './settle';
import type { Metric } from '../types';

/** Rows fetched per kind. The queue shows 10, "Show N more" reveals the rest. */
export const FETCH_PER_KIND = 25;
export const UNFILLED_WINDOW_HOURS = 48;
export const PERM_APPLICANT_WAIT_DAYS = 3;

export async function group<R>(
	kind: AttentionKind,
	countQuery: () => Promise<{ count: number }[]>,
	rowsQuery: () => Promise<R[]>,
	toItem: (row: R) => AttentionItem
): Promise<AttentionGroup> {
	const result = await settle(kind, async () => {
		const [[{ count: total }], rows] = await Promise.all([countQuery(), rowsQuery()]);
		return { count: Number(total), items: rows.map(toItem) };
	});
	return { kind, result };
}

function requireAll(scope: DashboardScope) {
	// The admin queue reads every practice's data; never run it for a practice scope.
	if (scope.kind !== 'all') throw new Error('Admin attention queries need the DTSS scope');
}

/** Company name for a client profile without fanning out on the non-unique client_id. */
export const companyNameForClient = (clientIdColumn: AnyColumn) =>
	sql<string | null>`(select ${clientCompanyTable.companyName} from ${clientCompanyTable} where ${clientCompanyTable.clientId} = ${clientIdColumn} limit 1)`;

// --- UNFILLED_SOON -----------------------------------------------------------

export function unfilledSoonWhere(now: Date): SQL {
	return and(
		eq(recurrenceDayTable.status, 'OPEN'),
		eq(recurrenceDayTable.archived, false),
		eq(requisitionTable.permanentPosition, false),
		sql`coalesce(${requisitionTable.archived}, false) = false`,
		notInArray(requisitionTable.status, ['CANCELED', 'CLOSED']),
		// Not over yet, and starting within the window.
		gt(recurrenceDayTable.dayEnd, now),
		lt(recurrenceDayTable.dayStart, new Date(now.getTime() + UNFILLED_WINDOW_HOURS * 3_600_000))
	)!;
}

export function unfilledSoon(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	const where = unfilledSoonWhere(now);
	return group(
		'UNFILLED_SOON',
		() =>
			db
				.select({ count: count() })
				.from(recurrenceDayTable)
				.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
				.where(where),
		() =>
			db
				.select({
					id: recurrenceDayTable.id,
					requisitionId: requisitionTable.id,
					createdAt: recurrenceDayTable.createdAt,
					dayStart: recurrenceDayTable.dayStart,
					dayEnd: recurrenceDayTable.dayEnd,
					timezone: requisitionTable.referenceTimezone,
					disciplineName: disciplineTable.name,
					companyName: clientCompanyTable.companyName,
					locationName: companyOfficeLocationTable.name
				})
				.from(recurrenceDayTable)
				.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
				.innerJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
				.leftJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
				.leftJoin(companyOfficeLocationTable, eq(companyOfficeLocationTable.id, requisitionTable.locationId))
				.where(where)
				.orderBy(asc(recurrenceDayTable.dayStart))
				.limit(FETCH_PER_KIND),
		(row) => unfilledSoonItem(row, now)
	);
}

// --- Timesheets ----------------------------------------------------------------

const timesheetRow = {
	id: timeSheetTable.id,
	weekBeginDate: timeSheetTable.weekBeginDate,
	totalHoursWorked: timeSheetTable.totalHoursWorked,
	since: sql<Date>`coalesce(${timeSheetTable.submittedAt}, ${timeSheetTable.updatedAt})`.mapWith(
		(v) => new Date(v)
	),
	candidateFirstName: userTable.firstName,
	candidateLastName: userTable.lastName,
	companyName: clientCompanyTable.companyName,
	disciplineName: disciplineTable.name,
	locationName: companyOfficeLocationTable.name
};

export function timesheetRows(where: SQL) {
	return db
		.select(timesheetRow)
		.from(timeSheetTable)
		.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
		.leftJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.leftJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.leftJoin(companyOfficeLocationTable, eq(companyOfficeLocationTable.id, requisitionTable.locationId))
		.leftJoin(candidateProfileTable, eq(candidateProfileTable.id, timeSheetTable.associatedCandidateId))
		.leftJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
		.where(where)
		.orderBy(asc(sql`coalesce(${timeSheetTable.submittedAt}, ${timeSheetTable.updatedAt})`))
		.limit(FETCH_PER_KIND);
}

export function timesheetCount(where: SQL) {
	return db
		.select({ count: count() })
		.from(timeSheetTable)
		.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
		.where(where);
}

export function timesheetDiscrepancies(scope: DashboardScope) {
	requireAll(scope);
	// COUNT(*), not rows.length of a capped fetch (10 §5 rule 6).
	const where = eq(timeSheetTable.status, 'DISCREPANCY');
	return group('TIMESHEET_DISCREPANCY', () => timesheetCount(where), () => timesheetRows(where), discrepancyItem);
}

export function timesheetsPending(scope: DashboardScope) {
	requireAll(scope);
	// PENDING only: DRAFT waits on the professional, not on DTSS (10 §2.2).
	const where = eq(timeSheetTable.status, 'PENDING');
	return group('TIMESHEET_PENDING', () => timesheetCount(where), () => timesheetRows(where), (row) =>
		pendingTimesheetItem(row, { audience: 'admin', canApprove: scope.can.approveTimesheets })
	);
}

// --- Billing -----------------------------------------------------------------

export function overdueInvoices(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	// The one definition of overdue: open (sent, unpaid) and past its due date.
	const where = and(eq(invoiceTable.status, 'open'), lt(invoiceTable.dueDate, now))!;
	return group(
		'INVOICE_OVERDUE',
		() => db.select({ count: count() }).from(invoiceTable).where(where),
		() =>
			db
				.select({
					id: invoiceTable.id,
					invoiceNumber: invoiceTable.invoiceNumber,
					amountRemaining: invoiceTable.amountRemaining,
					dueDate: invoiceTable.dueDate,
					createdAt: invoiceTable.createdAt,
					companyName: companyNameForClient(invoiceTable.clientId)
				})
				.from(invoiceTable)
				.where(where)
				.orderBy(asc(invoiceTable.dueDate))
				.limit(FETCH_PER_KIND),
		(row) => overdueInvoiceItem({ ...row, createdAt: row.createdAt ?? now }, 'admin', now)
	);
}

export function unbilledPlacements(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	// The shared predicate, so this matches /requisitions?filter=unbilled exactly.
	const where = unbilledPlacementCondition()!;
	return group(
		'PERM_UNBILLED',
		() => db.select({ count: count() }).from(requisitionTable).where(where),
		() =>
			db
				.select({
					id: requisitionTable.id,
					disciplineName: disciplineTable.name,
					companyName: clientCompanyTable.companyName,
					since: requisitionTable.updatedAt
				})
				.from(requisitionTable)
				.leftJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
				.leftJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
				.where(where)
				.orderBy(asc(requisitionTable.updatedAt))
				.limit(FETCH_PER_KIND),
		(row) => unbilledPlacementItem(row, now)
	);
}

// --- People --------------------------------------------------------------------

/** PENDING applications on OPEN permanent requests, grouped per request. */
export function permApplicantsWhere(olderThan: Date | null): SQL {
	return and(
		eq(requisitionApplicationTable.status, 'PENDING'),
		sql`coalesce(${requisitionApplicationTable.archived}, false) = false`,
		eq(requisitionTable.permanentPosition, true),
		eq(requisitionTable.status, 'OPEN'),
		olderThan ? lt(requisitionApplicationTable.createdAt, olderThan) : undefined
	)!;
}

export function permApplicantRows(where: SQL) {
	return db
		.select({
			requisitionId: requisitionTable.id,
			disciplineName: disciplineTable.name,
			companyName: clientCompanyTable.companyName,
			locationName: companyOfficeLocationTable.name,
			waiting: count(),
			oldest: min(requisitionApplicationTable.createdAt)
		})
		.from(requisitionApplicationTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, requisitionApplicationTable.requisitionId))
		.leftJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
		.leftJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.leftJoin(companyOfficeLocationTable, eq(companyOfficeLocationTable.id, requisitionTable.locationId))
		.where(where)
		.groupBy(requisitionTable.id, disciplineTable.name, clientCompanyTable.companyName, companyOfficeLocationTable.name)
		.orderBy(asc(min(requisitionApplicationTable.createdAt)))
		.limit(FETCH_PER_KIND);
}

export function permApplicantCount(where: SQL) {
	return db
		.select({ count: countDistinct(requisitionTable.id) })
		.from(requisitionApplicationTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, requisitionApplicationTable.requisitionId))
		.where(where);
}

export function permApplicantsWaiting(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	const where = permApplicantsWhere(new Date(now.getTime() - PERM_APPLICANT_WAIT_DAYS * 86_400_000));
	return group('PERM_APPLICANTS_WAITING', () => permApplicantCount(where), () => permApplicantRows(where), (row) =>
		permApplicantsItem({ ...row, oldest: row.oldest ?? now }, 'admin', now)
	);
}

export function pendingProfessionals(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	const where = eq(candidateProfileTable.status, 'PENDING');
	return group(
		'PRO_PENDING_APPROVAL',
		() => db.select({ count: count() }).from(candidateProfileTable).where(where),
		() =>
			db
				.select({
					id: candidateProfileTable.id,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					createdAt: candidateProfileTable.createdAt,
					disciplines: sql<string | null>`null`
				})
				.from(candidateProfileTable)
				.innerJoin(userTable, eq(userTable.id, candidateProfileTable.userId))
				.where(where)
				.orderBy(asc(candidateProfileTable.createdAt))
				.limit(FETCH_PER_KIND),
		(row) => pendingProfessionalItem(row, now)
	);
}

export function pendingClients(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	const where = eq(clientProfileTable.status, 'PENDING');
	return group(
		'CLIENT_PENDING_APPROVAL',
		() => db.select({ count: count() }).from(clientProfileTable).where(where),
		() =>
			db
				.select({
					id: clientProfileTable.id,
					companyName: companyNameForClient(clientProfileTable.id),
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					createdAt: clientProfileTable.createdAt
				})
				.from(clientProfileTable)
				.innerJoin(userTable, eq(userTable.id, clientProfileTable.userId))
				.where(where)
				.orderBy(asc(clientProfileTable.createdAt))
				.limit(FETCH_PER_KIND),
		(row) => pendingClientItem(row, now)
	);
}

export function openSupportTickets(scope: DashboardScope) {
	requireAll(scope);
	const where = ne(supportTicketTable.status, 'CLOSED');
	return group(
		'SUPPORT_OPEN',
		() => db.select({ count: count() }).from(supportTicketTable).where(where),
		() =>
			db
				.select({
					id: supportTicketTable.id,
					ticketNumber: supportTicketTable.ticketNumber,
					title: supportTicketTable.title,
					status: supportTicketTable.status,
					reporterFirstName: userTable.firstName,
					reporterLastName: userTable.lastName,
					updatedAt: supportTicketTable.updatedAt,
					createdAt: supportTicketTable.createdAt
				})
				.from(supportTicketTable)
				.innerJoin(userTable, eq(userTable.id, supportTicketTable.reportedById))
				.where(where)
				.orderBy(asc(supportTicketTable.createdAt))
				.limit(FETCH_PER_KIND),
		supportItem
	);
}

// --- Compliance ----------------------------------------------------------------

export type ComplianceSource = {
	subjectId: string;
	subjectName: string;
	ruleKey: string;
	severity: string;
	title: string;
	detail: string;
	dueOn: string | null;
	upcomingShifts: unknown[];
	snoozedUntil: string | null;
	remindable: boolean;
	remindedAt?: string | null;
};

/**
 * CRITICAL and BLOCKED compliance items as queue groups, from the already-loaded
 * `getComplianceItems()` list (snooze-aware, sorted). The count is that same list's length.
 */
export function complianceGroups(items: Metric<ComplianceSource[]>, now = new Date()): AttentionGroup[] {
	return (['CRITICAL', 'BLOCKED'] as const).map((severity) => {
		const kind = severity === 'CRITICAL' ? 'COMPLIANCE_CRITICAL' : 'COMPLIANCE_BLOCKED';
		if (!items.ok) return { kind, result: { ok: false } } satisfies AttentionGroup;
		const rows = items.value.filter((i) => i.severity === severity && !i.snoozedUntil);
		return {
			kind,
			result: {
				ok: true,
				value: {
					count: rows.length,
					items: rows.slice(0, FETCH_PER_KIND).map((i) =>
						complianceItem(
							{
								subjectId: i.subjectId,
								subjectName: i.subjectName,
								ruleKey: i.ruleKey,
								severity,
								title: i.title,
								detail: i.detail,
								dueOn: i.dueOn,
								upcomingShiftCount: i.upcomingShifts.length,
								remindable: i.remindable,
								remindedAt: i.remindedAt ?? null
							} satisfies ComplianceQueueRow,
							now
						)
					)
				}
			}
		} satisfies AttentionGroup;
	});
}

/** Every admin kind except compliance (which comes from the shared compliance load). */
export async function adminAttention(scope: DashboardScope, now = new Date()): Promise<AttentionGroup[]> {
	requireAll(scope);
	return Promise.all([
		unfilledSoon(scope, now),
		timesheetDiscrepancies(scope),
		overdueInvoices(scope, now),
		unbilledPlacements(scope, now),
		timesheetsPending(scope),
		permApplicantsWaiting(scope, now),
		pendingProfessionals(scope, now),
		pendingClients(scope, now),
		openSupportTickets(scope)
	]);
}
