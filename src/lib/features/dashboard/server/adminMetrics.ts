/**
 * DTSS admin KPIs, pipeline, receivables and the permanent pipeline (10 §3.3–3.4,
 * §3.8). Each reads rows for the shared KPI window and hands them to the pure
 * functions in ../kpis.ts. Every function takes the scope (10 §4.2 rule 1).
 */
import { and, count, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { actionHistoryTable } from '$lib/server/database/schemas/admin';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import {
	candidateRequisitionSavesTable,
	invoiceTable,
	recurrenceDayTable,
	requisitionApplicationTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { getWagesDueTotal } from '$lib/server/database/queries/admin';
import {
	bucketReceivables,
	dailySeries,
	fillRate,
	inRange,
	medianTimeToFill,
	sum
} from '../kpis';
import type { AdminKpis, DashboardScope, KpiWindow, PermPipeline, Receivables, ShiftPipeline } from '../types';
import { timesheetStages } from '../timesheetStages';
import { kpiWindowBounds, type WindowBounds } from '../window';
import { settle } from './settle';
import { getShiftPipelineSummaryBetween } from './shiftPipeline';

function requireAll(scope: DashboardScope) {
	if (scope.kind !== 'all') throw new Error('Admin metrics need the DTSS scope');
}

async function fillRateKpi(b: WindowBounds) {
	const rows = await db
		.select({ status: recurrenceDayTable.status, dayStart: recurrenceDayTable.dayStart })
		.from(recurrenceDayTable)
		.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
		.where(
			and(
				eq(recurrenceDayTable.archived, false),
				eq(requisitionTable.permanentPosition, false),
				inArray(recurrenceDayTable.status, ['FILLED', 'UNFULFILLED']),
				gte(recurrenceDayTable.dayStart, b.prevStart),
				lt(recurrenceDayTable.dayStart, b.end)
			)
		);
	const current = rows.filter((r) => inRange(r.dayStart, b.start, b.end));
	return {
		current: fillRate(current),
		previous: fillRate(rows.filter((r) => inRange(r.dayStart, b.prevStart, b.prevEnd))),
		series: dailySeries(current, b.days, (r) => r.dayStart, fillRate)
	};
}

/**
 * Posting → first CLAIM/ASSIGN in the ledger, for shifts first filled in the window.
 * Shifts assigned in the transaction that created them (metadata.onCreate) are
 * pre-arranged, not a response time, and are excluded (10 §5b).
 */
async function timeToFillKpi(b: WindowBounds) {
	const filledAt = sql<Date>`min(${actionHistoryTable.createdAt})`;
	const rows = await db
		.select({
			postedAt: recurrenceDayTable.createdAt,
			filledAt: filledAt.mapWith((v) => new Date(v)),
			preArranged: sql<boolean>`bool_or(coalesce((${actionHistoryTable.metadata}->>'onCreate')::boolean, false))`
		})
		.from(actionHistoryTable)
		.innerJoin(recurrenceDayTable, eq(recurrenceDayTable.id, actionHistoryTable.entityId))
		.where(
			and(
				eq(actionHistoryTable.entityType, 'RECURRENCE_DAYS'),
				inArray(actionHistoryTable.action, ['CLAIM', 'ASSIGN'])
			)
		)
		.groupBy(recurrenceDayTable.id, recurrenceDayTable.createdAt)
		.having(sql`${filledAt} >= ${b.prevStart} and ${filledAt} < ${b.end}`);

	const current = rows.filter((r) => inRange(r.filledAt, b.start, b.end));
	return {
		current: medianTimeToFill(current),
		previous: medianTimeToFill(rows.filter((r) => inRange(r.filledAt, b.prevStart, b.prevEnd))),
		series: dailySeries(current, b.days, (r) => r.filledAt, medianTimeToFill),
		sample: current.filter((r) => !r.preArranged).length
	};
}

/** Invoices raised in the window, excluding drafts and voids. */
async function billedKpi(b: WindowBounds) {
	const rows = await db
		.select({ total: invoiceTable.total, createdAt: invoiceTable.createdAt })
		.from(invoiceTable)
		.where(
			and(
				notInArray(invoiceTable.status, ['draft', 'void']),
				gte(invoiceTable.createdAt, b.prevStart),
				lt(invoiceTable.createdAt, b.end)
			)
		);
	const amounts = (list: typeof rows) => sum(list.map((r) => Number(r.total) || 0));
	const current = rows.filter((r) => r.createdAt && inRange(r.createdAt, b.start, b.end));
	return {
		current: amounts(current),
		previous: amounts(rows.filter((r) => r.createdAt && inRange(r.createdAt, b.prevStart, b.prevEnd))),
		series: dailySeries(current, b.days, (r) => r.createdAt!, amounts)
	};
}

async function wagesOwedKpi() {
	const [[{ count: owed }], amount] = await Promise.all([
		db.select({ count: count() }).from(timeSheetTable).where(eq(timeSheetTable.wagesStatus, 'WAGES_DUE')),
		// The existing overtime-accurate total, same source as /timesheets?tab=approved&wages=WAGES_DUE.
		getWagesDueTotal()
	]);
	return { amount, count: Number(owed) };
}

export async function adminKpis(scope: DashboardScope, window: KpiWindow, now = new Date()): Promise<AdminKpis> {
	requireAll(scope);
	const b = kpiWindowBounds(window, now);
	const [fill, ttf, billed, wages] = await Promise.all([
		settle('fillRate', () => fillRateKpi(b)),
		settle('timeToFill', () => timeToFillKpi(b)),
		settle('billed', () => billedKpi(b)),
		settle('wagesOwed', wagesOwedKpi)
	]);
	return { window, fillRate: fill, timeToFill: ttf, billed, wagesOwed: wages };
}

/** The Requisition Summary, on the KPI window's full calendar period. */
export function shiftPipeline(scope: DashboardScope, window: KpiWindow, now = new Date()) {
	requireAll(scope);
	const b = kpiWindowBounds(window, now);
	return settle<ShiftPipeline>('shiftPipeline', () =>
		getShiftPipelineSummaryBetween([b.start, b.periodEnd])
	);
}

export function receivables(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	return settle<Receivables>('receivables', async () => {
		const rows = await db
			.select({ amountRemaining: invoiceTable.amountRemaining, dueDate: invoiceTable.dueDate })
			.from(invoiceTable)
			.where(eq(invoiceTable.status, 'open'));
		return bucketReceivables(
			rows.map((r) => ({ amountRemaining: Number(r.amountRemaining) || 0, dueDate: r.dueDate })),
			now
		);
	});
}

/** Open permanent requests by stage (10 §3.8; lifecycle in 06 › Permanent hiring). */
export function permPipeline(scope: DashboardScope) {
	requireAll(scope);
	const openPerm = and(
		eq(requisitionTable.permanentPosition, true),
		eq(requisitionTable.status, 'OPEN'),
		sql`coalesce(${requisitionTable.archived}, false) = false`
	);
	const pendingApps = (source: 'CANDIDATE' | 'ADMIN_RECOMMENDED') =>
		db
			.select({ count: count() })
			.from(requisitionApplicationTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, requisitionApplicationTable.requisitionId))
			.where(
				and(
					openPerm,
					eq(requisitionApplicationTable.status, 'PENDING'),
					eq(requisitionApplicationTable.source, source),
					sql`coalesce(${requisitionApplicationTable.archived}, false) = false`
				)
			);

	return settle<PermPipeline>('permPipeline', async () => {
		const [[open], [interested], [applied], [recommended], [hired]] = await Promise.all([
			db.select({ count: count() }).from(requisitionTable).where(openPerm),
			db
				.select({ count: count() })
				.from(candidateRequisitionSavesTable)
				.innerJoin(requisitionTable, eq(requisitionTable.id, candidateRequisitionSavesTable.requisitionId))
				.where(openPerm),
			pendingApps('CANDIDATE'),
			pendingApps('ADMIN_RECOMMENDED'),
			db
				.select({ count: count() })
				.from(requisitionTable)
				.where(and(eq(requisitionTable.permanentPosition, true), eq(requisitionTable.status, 'PAYMENT_REQUIRED')))
		]);
		return {
			open: Number(open.count),
			interested: Number(interested.count),
			applied: Number(applied.count),
			recommended: Number(recommended.count),
			hired: Number(hired.count)
		};
	});
}

/** Timesheets grouped for the stages card, with the joins /timesheets lists by. */
export function timesheetStageCounts(scope: DashboardScope) {
	requireAll(scope);
	return settle('timesheetStages', async () => {
		const rows = await db
			.select({
				status: timeSheetTable.status,
				wagesStatus: timeSheetTable.wagesStatus,
				count: count(),
				hours: sql<number>`coalesce(sum(${timeSheetTable.totalHoursWorked}), 0)`.mapWith(Number)
			})
			.from(timeSheetTable)
			.innerJoin(requisitionTable, eq(requisitionTable.id, timeSheetTable.requisitionId))
			.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
			.innerJoin(candidateProfileTable, eq(candidateProfileTable.id, timeSheetTable.associatedCandidateId))
			.groupBy(timeSheetTable.status, timeSheetTable.wagesStatus);
		return timesheetStages(rows);
	});
}
