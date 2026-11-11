/**
 * Practice dashboard queries (10 §4): "Waiting on you", upcoming shifts and At a
 * glance, for owners and staff. Every query takes the DashboardScope and filters by
 * the practice (client/company) AND its location set; [] locations returns nothing.
 * Sections a capability excludes are not queried at all (10 §4.2 rule 3).
 */
import { and, asc, count, eq, gte, inArray, lt, notExists, sql, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { clientStaffLocationTable, clientStaffProfileTable } from '$lib/server/database/schemas/client';
import {
	invoiceTable,
	recurrenceDayTable,
	requisitionTable,
	timeSheetTable,
	timesheetExpenseTable
} from '$lib/server/database/schemas/requisition';
import { getClientSignatureViews } from '$lib/server/signatures/view';
import { hasNoLocations } from '../scope';
import type { AttentionGroup, DashboardScope, Metric, PracticeBilling } from '../types';
import {
	dueInvoiceItem,
	overdueInvoiceItem,
	pendingTimesheetItem,
	permApplicantsItem,
	signatureItem,
	staffNoLocationItem
} from './attentionRules';
import {
	FETCH_PER_KIND,
	group,
	permApplicantCount,
	permApplicantRows,
	permApplicantsWhere,
	timesheetCount,
	timesheetRows
} from './needsAttention';
import { requisitionScope } from './coverage';
import { settle } from './settle';

export const INVOICE_DUE_SOON_DAYS = 7;

const nothing = () => Promise.resolve([{ count: 0 }]);
const noRows = <R>() => Promise.resolve([] as R[]);
type Row<F extends (...args: never[]) => PromiseLike<unknown[]>> = Awaited<ReturnType<F>>[number];
type InvoiceQueueRow = {
	id: string;
	invoiceNumber: string;
	amountRemaining: string | null;
	dueDate: Date | null;
	createdAt: Date | null;
	hostedUrl: string | null;
};

/** Location condition on the requisition behind a row; false when the scope covers nothing. */
function locationCondition(scope: DashboardScope): SQL | undefined | false {
	if (hasNoLocations(scope)) return false;
	return Array.isArray(scope.locationIds) ? inArray(requisitionTable.locationId, scope.locationIds) : undefined;
}

function requirePractice(scope: DashboardScope): asserts scope is DashboardScope & { clientId: string } {
	if (scope.kind === 'all' || !scope.clientId) throw new Error('Practice queries need a practice scope');
}

// --- Waiting on you --------------------------------------------------------------

function pendingTimesheets(scope: DashboardScope) {
	requirePractice(scope);
	const loc = locationCondition(scope);
	const where = and(
		eq(timeSheetTable.associatedClientId, scope.clientId),
		eq(timeSheetTable.status, 'PENDING'),
		loc || undefined
	)!;
	const approver = scope.ownerName ? `${scope.ownerName.split(' ')[0]} (owner)` : 'your practice admin';
	return group(
		'TIMESHEET_PENDING',
		loc === false ? nothing : () => timesheetCount(where),
		loc === false ? noRows<Row<typeof timesheetRows>> : () => timesheetRows(where),
		(row) =>
			pendingTimesheetItem(row, {
				audience: 'practice',
				canApprove: scope.can.approveTimesheets,
				approverName: approver
			})
	);
}

function permApplicants(scope: DashboardScope, now: Date) {
	requirePractice(scope);
	const reqScope = requisitionScope(scope);
	const where = and(permApplicantsWhere(null), reqScope || undefined)!;
	return group(
		'PERM_APPLICANTS_WAITING',
		reqScope === false ? nothing : () => permApplicantCount(where),
		reqScope === false ? noRows<Row<typeof permApplicantRows>> : () => permApplicantRows(where),
		(row) => permApplicantsItem({ ...row, oldest: row.oldest ?? now }, 'practice', now)
	);
}

function invoiceWhere(scope: DashboardScope & { clientId: string }, extra: SQL): SQL | false {
	const loc = locationCondition(scope);
	if (loc === false) return false;
	return and(eq(invoiceTable.clientId, scope.clientId), extra, loc)!;
}

function invoiceGroup(
	kind: 'INVOICE_OVERDUE' | 'INVOICE_DUE',
	scope: DashboardScope & { clientId: string },
	where: SQL | false,
	invoiceMethod: string | null,
	now: Date
) {
	// Location-scoped invoices are matched through their requisition, as before.
	const scoped = Array.isArray(scope.locationIds);
	return group(
		kind,
		where === false
			? nothing
			: () => {
					const q = db.select({ count: count() }).from(invoiceTable);
					return (scoped ? q.leftJoin(requisitionTable, eq(requisitionTable.id, invoiceTable.requisitionId)) : q).where(where);
				},
		where === false
			? noRows<InvoiceQueueRow>
			: (): Promise<InvoiceQueueRow[]> => {
					const q = db
						.select({
							id: invoiceTable.id,
							invoiceNumber: invoiceTable.invoiceNumber,
							amountRemaining: invoiceTable.amountRemaining,
							dueDate: invoiceTable.dueDate,
							createdAt: invoiceTable.createdAt,
							hostedUrl: invoiceTable.stripeHostedUrl
						})
						.from(invoiceTable);
					return (scoped ? q.leftJoin(requisitionTable, eq(requisitionTable.id, invoiceTable.requisitionId)) : q)
						.where(where)
						.orderBy(asc(invoiceTable.dueDate))
						.limit(FETCH_PER_KIND);
				},
		(row) => {
			const r = { ...row, createdAt: row.createdAt ?? now, companyName: null, invoiceMethod };
			return kind === 'INVOICE_OVERDUE' ? overdueInvoiceItem(r, 'practice', now) : dueInvoiceItem(r, now);
		}
	);
}

function staffWithoutLocation(scope: DashboardScope & { clientId: string }) {
	const where = and(
		eq(clientStaffProfileTable.clientId, scope.clientId),
		inArray(clientStaffProfileTable.staffRole, ['CLIENT_MANAGER', 'CLIENT_EMPLOYEE']),
		notExists(
			db
				.select({ one: sql`1` })
				.from(clientStaffLocationTable)
				.where(eq(clientStaffLocationTable.staffId, clientStaffProfileTable.id))
		)
	)!;
	return group(
		'STAFF_NO_LOCATION',
		() => db.select({ count: count() }).from(clientStaffProfileTable).where(where),
		() =>
			db
				.select({
					id: clientStaffProfileTable.id,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					createdAt: clientStaffProfileTable.createdAt
				})
				.from(clientStaffProfileTable)
				.innerJoin(userTable, eq(userTable.id, clientStaffProfileTable.userId))
				.where(where)
				.orderBy(asc(clientStaffProfileTable.createdAt))
				.limit(FETCH_PER_KIND),
		staffNoLocationItem
	);
}

export async function practiceAttention(
	scope: DashboardScope,
	opts: { userId: string; isOwner: boolean; invoiceMethod: string | null },
	now = new Date()
): Promise<AttentionGroup[]> {
	requirePractice(scope);
	const tasks: Promise<AttentionGroup>[] = [pendingTimesheets(scope), permApplicants(scope, now)];

	if (scope.can.viewBilling) {
		tasks.push(
			invoiceGroup(
				'INVOICE_OVERDUE',
				scope,
				invoiceWhere(scope, and(eq(invoiceTable.status, 'open'), lt(invoiceTable.dueDate, now))!),
				opts.invoiceMethod,
				now
			),
			invoiceGroup(
				'INVOICE_DUE',
				scope,
				invoiceWhere(
					scope,
					and(
						eq(invoiceTable.status, 'open'),
						gte(invoiceTable.dueDate, now),
						lt(invoiceTable.dueDate, new Date(now.getTime() + INVOICE_DUE_SOON_DAYS * 86_400_000))
					)!
				),
				opts.invoiceMethod,
				now
			)
		);
	}
	if (scope.can.manageStaff) tasks.push(staffWithoutLocation(scope));

	// Agreements wait on the account owner's own signature (unchanged rule: CLIENT only).
	if (opts.isOwner) {
		tasks.push(
			settle('signatures', async () => {
				const views = await getClientSignatureViews(scope.clientId, { userId: opts.userId, isAdmin: false });
				const rows = views.filter((v) => v.signingUrl);
				return {
					count: rows.length,
					items: rows.map((v) =>
						signatureItem({ id: String(v.id), title: v.title, signingUrl: v.signingUrl! }, now)
					)
				};
			}).then((result) => ({ kind: 'SIGNATURE_PENDING' as const, result }))
		);
	}

	return Promise.all(tasks);
}

// --- At a glance -------------------------------------------------------------------

export type PracticeGlance = {
	openRequests: Metric<number>;
	shiftsThisMonth: Metric<{ filled: number; total: number }>;
	/** Absent when the user can't view billing: omitted, not $0 (10 §4.2 rule 3). */
	balance: Metric<PracticeBilling> | null;
};


export async function practiceGlance(scope: DashboardScope, month: { first: string; last: string }, now = new Date()): Promise<PracticeGlance> {
	requirePractice(scope);
	const reqScope = requisitionScope(scope);
	const loc = locationCondition(scope);

	const openRequests = settle('openRequests', async () => {
		if (reqScope === false) return 0;
		const [r] = await db
			.select({ count: count() })
			.from(requisitionTable)
			.where(and(reqScope, eq(requisitionTable.status, 'OPEN'), sql`coalesce(${requisitionTable.archived}, false) = false`));
		return Number(r.count);
	});

	const shiftsThisMonth = settle('shiftsThisMonth', async () => {
		if (reqScope === false) return { filled: 0, total: 0 };
		const [r] = await db
			.select({
				total: count(),
				filled: sql<number>`count(*) filter (where ${recurrenceDayTable.status} = 'FILLED')`.mapWith(Number)
			})
			.from(recurrenceDayTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
			.where(
				and(
					reqScope,
					eq(recurrenceDayTable.archived, false),
					inArray(recurrenceDayTable.status, ['OPEN', 'FILLED', 'UNFULFILLED']),
					gte(recurrenceDayTable.date, month.first),
					sql`${recurrenceDayTable.date} <= ${month.last}`
				)
			);
		return { filled: Number(r.filled), total: Number(r.total) };
	});

	const balance = scope.can.viewBilling ? settle('balanceDue', () => practiceBilling(scope, month, now)) : Promise.resolve(null);

	const [a, b, c] = await Promise.all([openRequests, shiftsThisMonth, balance]);
	return { openRequests: a, shiftsThisMonth: b, balance: c };
}

async function practiceBilling(
	scope: DashboardScope & { clientId: string },
	month: { first: string },
	now: Date
): Promise<PracticeBilling> {
	const loc = locationCondition(scope);
	const empty: PracticeBilling = { due: 0, dueCount: 0, overdue: 0, overdueCount: 0, paidThisMonth: 0, timesheetsAwaiting: 0, expensesPending: 0, expensesPendingCount: 0 };
	if (loc === false) return empty;
	// Location-scoped rows are matched through their requisition, as everywhere else here.
	const scoped = Array.isArray(scope.locationIds);
	const monthStart = new Date(`${month.first}T00:00:00`);

	const invoices = db
		.select({
			due: sql<number>`coalesce(sum(${invoiceTable.amountRemaining}) filter (where ${invoiceTable.status} = 'open'), 0)`.mapWith(Number),
			dueCount: sql<number>`count(*) filter (where ${invoiceTable.status} = 'open')`.mapWith(Number),
			overdue: sql<number>`coalesce(sum(${invoiceTable.amountRemaining}) filter (where ${invoiceTable.status} = 'open' and ${invoiceTable.dueDate} < ${now}), 0)`.mapWith(Number),
			overdueCount: sql<number>`count(*) filter (where ${invoiceTable.status} = 'open' and ${invoiceTable.dueDate} < ${now})`.mapWith(Number),
			paidThisMonth: sql<number>`coalesce(sum(${invoiceTable.amountPaid}) filter (where ${invoiceTable.status} = 'paid' and ${invoiceTable.paidAt} >= ${monthStart}), 0)`.mapWith(Number)
		})
		.from(invoiceTable);
	const invoiceWhere = and(eq(invoiceTable.clientId, scope.clientId), loc);
	const invoiceQuery = scoped
		? invoices.leftJoin(requisitionTable, eq(requisitionTable.id, invoiceTable.requisitionId)).where(invoiceWhere)
		: invoices.where(invoiceWhere);

	const timesheets = timesheetCount(
		and(eq(timeSheetTable.associatedClientId, scope.clientId), eq(timeSheetTable.status, 'PENDING'), loc || undefined)!
	);

	const expenses = db
		.select({
			cents: sql<number>`coalesce(sum(${timesheetExpenseTable.amountCents}), 0)`.mapWith(Number),
			count: count()
		})
		.from(timesheetExpenseTable)
		.innerJoin(timeSheetTable, eq(timeSheetTable.id, timesheetExpenseTable.timesheetId))
		.leftJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
		.where(
			and(
				eq(timeSheetTable.associatedClientId, scope.clientId),
				eq(timesheetExpenseTable.status, 'PENDING'),
				sql`${timeSheetTable.status} not in ('VOID', 'REJECTED')`,
				loc || undefined
			)
		);

	const [[inv], [ts], [exp]] = await Promise.all([invoiceQuery, timesheets, expenses]);
	return {
		due: inv?.due || 0,
		dueCount: inv?.dueCount || 0,
		overdue: inv?.overdue || 0,
		overdueCount: inv?.overdueCount || 0,
		paidThisMonth: inv?.paidThisMonth || 0,
		timesheetsAwaiting: Number(ts?.count ?? 0),
		expensesPending: (exp?.cents || 0) / 100,
		expensesPendingCount: Number(exp?.count ?? 0)
	};
}
