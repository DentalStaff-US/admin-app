/**
 * Affiliate CSV exports for the admin console — the first consumers of the
 * generic export core in src/lib/server/export/csv.ts.
 *
 * Column sets are deliberately explicit (not "dump every column") so the files
 * are stable for a bookkeeper's import even as the schema evolves.
 */
import { desc, eq, and, gte, lte, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import db from '$lib/server/database/drizzle';
import {
	affiliateCommissionEventTable,
	affiliatePayoutTable,
	affiliateProfileTable
} from '$lib/server/database/schemas/affiliate';
import { userTable } from '$lib/server/database/schemas/auth';
import { invoiceTable } from '$lib/server/database/schemas/requisition';
import { toCsv, money, type CsvColumn } from '$lib/server/export/csv';

export type DateRange = { from?: Date; to?: Date };

/** Inclusive date-range predicate on a timestamp column; undefined = no filter. */
function rangeFilter(col: PgColumn, range: DateRange) {
	const parts: SQL[] = [];
	if (range.from) parts.push(gte(col, range.from));
	if (range.to) parts.push(lte(col, range.to));
	return parts.length ? and(...parts) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Ledger                                                                     */
/* -------------------------------------------------------------------------- */

export async function ledgerCsv(range: DateRange = {}): Promise<string> {
	const rows = await db
		.select({
			eventId: affiliateCommissionEventTable.id,
			createdAt: affiliateCommissionEventTable.createdAt,
			revenueAt: affiliateCommissionEventTable.revenueAt,
			cohortMonth: affiliateCommissionEventTable.cohortMonth,
			affiliatePid: affiliateProfileTable.pid,
			affiliateEmail: userTable.email,
			affiliateName: userTable.name,
			sourceType: affiliateCommissionEventTable.sourceType,
			status: affiliateCommissionEventTable.status,
			grossAmount: affiliateCommissionEventTable.grossAmount,
			commissionAmount: affiliateCommissionEventTable.commissionAmount,
			invoiceNumber: invoiceTable.invoiceNumber,
			payoutId: affiliateCommissionEventTable.payoutId,
			reversalOf: affiliateCommissionEventTable.reversalOfEventId,
			reversedReason: affiliateCommissionEventTable.reversedReason,
			ruleSnapshot: affiliateCommissionEventTable.ruleSnapshot
		})
		.from(affiliateCommissionEventTable)
		.innerJoin(
			affiliateProfileTable,
			eq(affiliateCommissionEventTable.affiliateId, affiliateProfileTable.id)
		)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.leftJoin(invoiceTable, eq(affiliateCommissionEventTable.invoiceId, invoiceTable.id))
		.where(rangeFilter(affiliateCommissionEventTable.revenueAt, range))
		.orderBy(desc(affiliateCommissionEventTable.revenueAt));

	type R = (typeof rows)[number];
	const snap = (r: R) => {
		try {
			return JSON.parse(r.ruleSnapshot ?? '{}') as Record<string, unknown>;
		} catch {
			return {};
		}
	};

	const columns: CsvColumn<R>[] = [
		{ header: 'Event ID', value: (r) => r.eventId },
		{ header: 'Created', value: (r) => r.createdAt },
		{ header: 'Revenue Date', value: (r) => r.revenueAt },
		{ header: 'Cohort Month', value: (r) => r.cohortMonth },
		{ header: 'Affiliate #', value: (r) => r.affiliatePid },
		{ header: 'Affiliate Name', value: (r) => r.affiliateName },
		{ header: 'Affiliate Email', value: (r) => r.affiliateEmail },
		{ header: 'Source', value: (r) => r.sourceType },
		{ header: 'Status', value: (r) => r.status },
		{ header: 'Invoice #', value: (r) => r.invoiceNumber },
		{ header: 'Base (Regular Hours $)', value: (r) => money(r.grossAmount) },
		{ header: 'Rate %', value: (r) => snap(r).ratePercent ?? '' },
		{ header: 'Rate Source', value: (r) => snap(r).rateSource ?? '' },
		{ header: 'Regular Hours', value: (r) => snap(r).regularHours ?? '' },
		{ header: 'Overtime Hours (excluded)', value: (r) => snap(r).overtimeHours ?? '' },
		{ header: 'Commission $', value: (r) => money(r.commissionAmount) },
		{ header: 'Payout ID', value: (r) => r.payoutId },
		{ header: 'Reversal Of', value: (r) => r.reversalOf },
		{ header: 'Reversal Reason', value: (r) => r.reversedReason }
	];

	return toCsv(rows, columns);
}

/* -------------------------------------------------------------------------- */
/* Payouts                                                                    */
/* -------------------------------------------------------------------------- */

export async function payoutsCsv(range: DateRange = {}): Promise<string> {
	const rows = await db
		.select({
			payoutId: affiliatePayoutTable.id,
			createdAt: affiliatePayoutTable.createdAt,
			cohortMonth: affiliatePayoutTable.cohortMonth,
			affiliatePid: affiliateProfileTable.pid,
			affiliateEmail: userTable.email,
			affiliateName: userTable.name,
			amount: affiliatePayoutTable.amount,
			status: affiliatePayoutTable.status,
			stripeTransferId: affiliatePayoutTable.stripeTransferId,
			stripeConnectAccountId: affiliatePayoutTable.stripeConnectAccountId,
			paidAt: affiliatePayoutTable.paidAt,
			failureReason: affiliatePayoutTable.failureReason
		})
		.from(affiliatePayoutTable)
		.innerJoin(
			affiliateProfileTable,
			eq(affiliatePayoutTable.affiliateId, affiliateProfileTable.id)
		)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.where(rangeFilter(affiliatePayoutTable.createdAt, range))
		.orderBy(desc(affiliatePayoutTable.createdAt));

	type R = (typeof rows)[number];
	const columns: CsvColumn<R>[] = [
		{ header: 'Payout ID', value: (r) => r.payoutId },
		{ header: 'Created', value: (r) => r.createdAt },
		{ header: 'Cohort Month', value: (r) => r.cohortMonth },
		{ header: 'Affiliate #', value: (r) => r.affiliatePid },
		{ header: 'Affiliate Name', value: (r) => r.affiliateName },
		{ header: 'Affiliate Email', value: (r) => r.affiliateEmail },
		{ header: 'Amount $', value: (r) => money(r.amount) },
		{ header: 'Status', value: (r) => r.status },
		{ header: 'Stripe Transfer ID', value: (r) => r.stripeTransferId },
		{ header: 'Stripe Connect Account', value: (r) => r.stripeConnectAccountId },
		{ header: 'Paid At', value: (r) => r.paidAt },
		{ header: 'Failure Reason', value: (r) => r.failureReason }
	];

	return toCsv(rows, columns);
}
