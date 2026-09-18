/**
 * Commission accrual and reversal — the impure half of the ledger.
 *
 * Accrual is triggered by an invoice reaching PAID (Stripe webhook, or the paper
 * `recordTransaction` action), never by timesheet approval: approval happens in
 * two duplicated code paths, whereas the invoice is the single chokepoint all
 * creation paths funnel through.
 *
 * SCOPE (Phase 1): temp shifts only. An invoice qualifies when it has a
 * timesheet and its requisition is not a permanent placement.
 */
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import db from '$lib/server/database/drizzle';
import {
	invoiceTable,
	timeSheetTable,
	requisitionTable
} from '$lib/server/database/schemas/requisition';
import { affiliateCommissionEventTable } from '$lib/server/database/schemas/affiliate';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import { clientProfileTable } from '$lib/server/database/schemas/client';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	computeHoursBreakdown,
	getApprovedBilledHoursForWeek
} from '$lib/server/database/queries/requisitions';
import {
	computeCommission,
	resolveCommissionBase,
	centsToDollarString,
	type InvoiceLineItemLike
} from '$lib/server/affiliate/commission';
import { cohortMonthFor } from '$lib/server/affiliate/payoutCycle';
import { findEarningAffiliates, getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import { logger } from '$lib/server/logger';

/** `invoice_paid:<invoiceId>:<affiliateId>` — the double-pay defense. */
export function accrualIdempotencyKey(invoiceId: string, affiliateId: string): string {
	return `invoice_paid:${invoiceId}:${affiliateId}`;
}

export function reversalIdempotencyKey(invoiceId: string, affiliateId: string): string {
	return `reversal:${invoiceId}:${affiliateId}`;
}

export type AccrualResult = {
	created: number;
	skipped: string | null;
};

/**
 * Write commission events for a newly-paid invoice.
 *
 * Idempotent: Stripe redelivers webhooks and the handler has no dedupe of its
 * own, so every insert is ON CONFLICT DO NOTHING against
 * UNIQUE(idempotency_key). Calling this twice for one invoice is a no-op.
 *
 * Never throws into the caller — a webhook must still return 2xx, and a failed
 * accrual is a recoverable bookkeeping problem, not a reason for Stripe to
 * retry the whole event forever.
 */
export async function accrueCommissionForPaidInvoice(invoiceId: string): Promise<AccrualResult> {
	try {
		return await accrueUnsafe(invoiceId);
	} catch (err) {
		logger.error('affiliate commission accrual failed', { error: err, invoiceId });
		return { created: 0, skipped: 'ERROR' };
	}
}

async function accrueUnsafe(invoiceId: string): Promise<AccrualResult> {
	const [invoice] = await db
		.select()
		.from(invoiceTable)
		.where(eq(invoiceTable.id, invoiceId))
		.limit(1);

	if (!invoice) return { created: 0, skipped: 'INVOICE_NOT_FOUND' };
	if (invoice.status !== 'paid') return { created: 0, skipped: 'INVOICE_NOT_PAID' };

	// Phase 1 scope: temp shifts only.
	if (!invoice.timesheetId) return { created: 0, skipped: 'NOT_A_TIMESHEET_INVOICE' };

	const [timesheet] = await db
		.select()
		.from(timeSheetTable)
		.where(eq(timeSheetTable.id, invoice.timesheetId))
		.limit(1);
	if (!timesheet) return { created: 0, skipped: 'TIMESHEET_NOT_FOUND' };

	// requisitionId is nullable on timesheets; without it there is no rate and no
	// permanent/temp discriminator, so there is nothing to commission.
	if (timesheet.requisitionId === null || timesheet.associatedCandidateId === null) {
		return { created: 0, skipped: 'TIMESHEET_MISSING_REQUISITION_OR_CANDIDATE' };
	}

	const [requisition] = await db
		.select({
			id: requisitionTable.id,
			hourlyRate: requisitionTable.hourlyRate,
			permanentPosition: requisitionTable.permanentPosition
		})
		.from(requisitionTable)
		.where(eq(requisitionTable.id, timesheet.requisitionId))
		.limit(1);
	if (!requisition) return { created: 0, skipped: 'REQUISITION_NOT_FOUND' };
	if (requisition.permanentPosition) return { created: 0, skipped: 'PERMANENT_PLACEMENT' };

	// Map the invoice's profile ids back to user ids — referrals are keyed by user.
	const clientUserId = await userIdForClientProfile(invoice.clientId);
	const candidateUserId = invoice.candidateId
		? await userIdForCandidateProfile(invoice.candidateId)
		: null;

	const earners = await findEarningAffiliates({ clientUserId, candidateUserId });
	if (earners.length === 0) return { created: 0, skipped: 'NO_ATTRIBUTED_AFFILIATE' };

	// Reproduce the split the invoice was built from. `createdBefore` pins the
	// sibling set to those that predate this timesheet, so the figure is stable
	// and reproducible rather than drifting as later sheets are approved.
	const priorWeekHours = await getApprovedBilledHoursForWeek({
		candidateId: timesheet.associatedCandidateId,
		requisitionId: timesheet.requisitionId,
		weekBeginDate: timesheet.weekBeginDate,
		excludeTimesheetId: timesheet.id,
		createdBefore: timesheet.createdAt
	});

	const effectiveRate = timesheet.adjustedHourlyRate ?? requisition.hourlyRate;
	const breakdown = computeHoursBreakdown(
		timesheet.totalHoursBilled ?? timesheet.totalHoursWorked ?? 0,
		effectiveRate,
		priorWeekHours
	);

	// The invoice is what the client actually paid, so it wins over recomputation.
	const base = resolveCommissionBase({
		invoiceLineItems: invoice.lineItems as InvoiceLineItemLike[] | null,
		recomputed: breakdown
	});

	if (base.discrepancyCents) {
		logger.warn('affiliate commission base differs from recomputed hours', {
			invoiceId,
			discrepancyCents: base.discrepancyCents,
			source: base.source
		});
	}

	const config = await getAffiliateConfig();
	const revenueAt = invoice.paidAt ?? new Date();
	const cohortMonth = cohortMonthFor(revenueAt);

	let created = 0;

	for (const earner of earners) {
		const [affiliate] = await db
			.select({ override: affiliateProfileTable.commissionRateOverride })
			.from(affiliateProfileTable)
			.where(eq(affiliateProfileTable.id, earner.affiliateId))
			.limit(1);

		const computation = computeCommission({
			// Feed the resolved base through as the regular-hours figure so the
			// invoice-derived amount is what gets commissioned.
			breakdown: { ...breakdown, regularCents: base.baseCents },
			affiliateOverride: affiliate?.override,
			programDefault: config.commissionRate
		});

		if (computation.commissionCents <= 0) continue;

		const [row] = await db
			.insert(affiliateCommissionEventTable)
			.values({
				id: nanoid(),
				affiliateId: earner.affiliateId,
				referralId: earner.referralId,
				sourceType: 'TEMP_SHIFT_INVOICE_PAID',
				invoiceId: invoice.id,
				timesheetId: timesheet.id,
				referredUserId: earner.referredUserId,
				grossAmount: computation.grossAmount,
				commissionAmount: computation.commissionAmount,
				status: 'PENDING',
				cohortMonth,
				revenueAt,
				idempotencyKey: accrualIdempotencyKey(invoice.id, earner.affiliateId),
				ruleSnapshot: JSON.stringify({
					...computation.snapshot,
					baseSource: base.source,
					...(base.discrepancyCents ? { baseDiscrepancyCents: base.discrepancyCents } : {}),
					priorWeekHours,
					effectiveRate
				})
			})
			.onConflictDoNothing({ target: affiliateCommissionEventTable.idempotencyKey })
			.returning({ id: affiliateCommissionEventTable.id });

		if (row) created++;
	}

	return { created, skipped: null };
}

/**
 * Reverse commission when an invoice is voided or refunded.
 *
 * Events that have not been paid out flip to REVERSED and drop out of their
 * cohort. Events already PAID cannot be un-paid, so they get an offsetting
 * NEGATIVE adjustment row instead, which nets off the affiliate's next payout —
 * the ledger stays append-only either way.
 */
export async function reverseCommissionForInvoice(
	invoiceId: string,
	reason: string
): Promise<{ reversed: number; adjusted: number }> {
	try {
		const events = await db
			.select()
			.from(affiliateCommissionEventTable)
			.where(
				and(
					eq(affiliateCommissionEventTable.invoiceId, invoiceId),
					eq(affiliateCommissionEventTable.sourceType, 'TEMP_SHIFT_INVOICE_PAID')
				)
			);

		let reversed = 0;
		let adjusted = 0;

		for (const event of events) {
			if (event.status === 'REVERSED') continue;

			if (event.status === 'PAID') {
				const negative = centsToDollarString(-Math.round(parseFloat(event.commissionAmount) * 100));
				const [row] = await db
					.insert(affiliateCommissionEventTable)
					.values({
						id: nanoid(),
						affiliateId: event.affiliateId,
						referralId: event.referralId,
						sourceType: 'MANUAL_ADJUSTMENT',
						invoiceId: event.invoiceId,
						timesheetId: event.timesheetId,
						referredUserId: event.referredUserId,
						grossAmount: '0.00',
						commissionAmount: negative,
						status: 'APPROVED',
						// Bill the clawback to the CURRENT cohort, not the original one —
						// the original has already been paid and settled.
						cohortMonth: cohortMonthFor(new Date()),
						revenueAt: new Date(),
						idempotencyKey: reversalIdempotencyKey(invoiceId, event.affiliateId),
						reversalOfEventId: event.id,
						reversedReason: reason,
						notes: `Clawback for already-paid commission on invoice ${invoiceId}`
					})
					.onConflictDoNothing({
						target: affiliateCommissionEventTable.idempotencyKey
					})
					.returning({ id: affiliateCommissionEventTable.id });
				if (row) adjusted++;
				continue;
			}

			await db
				.update(affiliateCommissionEventTable)
				.set({ status: 'REVERSED', reversedReason: reason, updatedAt: new Date() })
				.where(eq(affiliateCommissionEventTable.id, event.id));
			reversed++;
		}

		return { reversed, adjusted };
	} catch (err) {
		logger.error('affiliate commission reversal failed', { error: err, invoiceId });
		return { reversed: 0, adjusted: 0 };
	}
}

/* -------------------------------------------------------------------------- */
/* Profile -> user id                                                         */
/* -------------------------------------------------------------------------- */

async function userIdForClientProfile(clientProfileId: string): Promise<string | null> {
	const [row] = await db
		.select({ userId: clientProfileTable.userId })
		.from(clientProfileTable)
		.where(eq(clientProfileTable.id, clientProfileId))
		.limit(1);
	return row?.userId ?? null;
}

async function userIdForCandidateProfile(candidateProfileId: string): Promise<string | null> {
	const [row] = await db
		.select({ userId: candidateProfileTable.userId })
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, candidateProfileId))
		.limit(1);
	return row?.userId ?? null;
}
