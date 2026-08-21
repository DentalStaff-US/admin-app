/**
 * The monthly affiliate payout run.
 *
 * Schedule (locked with the client): everything paid in a calendar month is one
 * cohort, settled on the 1st of the month after next — March payments pay out
 * May 1. See payoutCycle.ts for the date maths.
 *
 * DOUBLE-PAYING IS THE WORST FAILURE MODE IN THIS SYSTEM. Three independent
 * defences, all required:
 *   1. UNIQUE(affiliate_id, cohort_month) on affiliate_payouts
 *   2. the caller's advisory lock, so two runs cannot overlap
 *   3. Stripe's own idempotency key on the transfer
 * And events are only marked PAID *after* the transfer confirms — never
 * optimistically.
 */
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import db from '$lib/server/database/drizzle';
import { stripe } from '$lib/server/stripe';
import {
	affiliateCommissionEventTable,
	affiliatePayoutTable,
	affiliateProfileTable
} from '$lib/server/database/schemas/affiliate';
import { getAffiliateConfig } from '$lib/server/database/queries/affiliates';
import { canReceivePayout, type AffiliateStatus } from '$lib/server/affiliate/eligibility';
import { payableCohortAsOf, decidePayout, dollarsToCents } from '$lib/server/affiliate/payoutCycle';
import { centsToDollarString } from '$lib/server/affiliate/commission';
import { logger } from '$lib/server/logger';

export type PayoutRunResult = {
	cohort: string;
	affiliatesConsidered: number;
	paid: number;
	rolledForward: number;
	skipped: number;
	failed: number;
	totalPaidCents: number;
};

/**
 * Promote matured PENDING commission to APPROVED.
 *
 * Separated from the transfer step so that "the hold has elapsed" is visible in
 * the portal (as an Approved balance) even if a transfer later fails.
 */
export async function approveMaturedCommission(now: Date): Promise<number> {
	const cohort = payableCohortAsOf(now);

	const rows = await db
		.update(affiliateCommissionEventTable)
		.set({ status: 'APPROVED', updatedAt: new Date() })
		.where(
			and(
				eq(affiliateCommissionEventTable.status, 'PENDING'),
				lte(affiliateCommissionEventTable.cohortMonth, cohort)
			)
		)
		.returning({ id: affiliateCommissionEventTable.id });

	return rows.length;
}

/**
 * Run the payout for every cohort matured as of `now`.
 *
 * Processes all matured cohorts, not just the current one, so a missed or failed
 * run is picked up automatically next pass rather than stranding an affiliate's
 * money.
 */
export async function runAffiliatePayouts(now: Date = new Date()): Promise<PayoutRunResult> {
	const cohort = payableCohortAsOf(now);
	const config = await getAffiliateConfig();
	const minimumCents = dollarsToCents(config.payoutMinimum);

	const approved = await approveMaturedCommission(now);
	if (approved > 0) {
		logger.info('affiliate commission approved for payout', { cohort, approved });
	}

	// Unpaid APPROVED balance per affiliate, across every matured cohort.
	//
	// Negative adjustments (clawbacks for commission already paid out) are
	// included here regardless of their own cohort, so a refund reduces the very
	// next payout rather than waiting two months to net off.
	const balances = await db
		.select({
			affiliateId: affiliateCommissionEventTable.affiliateId,
			totalCents: sql<number>`round(sum(${affiliateCommissionEventTable.commissionAmount}) * 100)::int`
		})
		.from(affiliateCommissionEventTable)
		.where(
			and(
				eq(affiliateCommissionEventTable.status, 'APPROVED'),
				isNull(affiliateCommissionEventTable.payoutId)
			)
		)
		.groupBy(affiliateCommissionEventTable.affiliateId);

	const result: PayoutRunResult = {
		cohort,
		affiliatesConsidered: balances.length,
		paid: 0,
		rolledForward: 0,
		skipped: 0,
		failed: 0,
		totalPaidCents: 0
	};

	for (const balance of balances) {
		try {
			const outcome = await payOneAffiliate({
				affiliateId: balance.affiliateId,
				balanceCents: Number(balance.totalCents ?? 0),
				minimumCents,
				cohort
			});
			if (outcome === 'PAID') {
				result.paid++;
				result.totalPaidCents += Number(balance.totalCents ?? 0);
			} else if (outcome === 'ROLLED_FORWARD') result.rolledForward++;
			else if (outcome === 'FAILED') result.failed++;
			else result.skipped++;
		} catch (err) {
			// One affiliate's failure must never abort the whole run.
			result.failed++;
			logger.error('affiliate payout failed', { error: err, affiliateId: balance.affiliateId });
		}
	}

	return result;
}

type PayoutOutcome = 'PAID' | 'ROLLED_FORWARD' | 'SKIPPED' | 'FAILED';

async function payOneAffiliate(input: {
	affiliateId: string;
	balanceCents: number;
	minimumCents: number;
	cohort: string;
}): Promise<PayoutOutcome> {
	const [affiliate] = await db
		.select({
			id: affiliateProfileTable.id,
			status: affiliateProfileTable.status,
			connectAccountId: affiliateProfileTable.stripeConnectAccountId,
			payoutsEnabled: affiliateProfileTable.connectPayoutsEnabled
		})
		.from(affiliateProfileTable)
		.where(eq(affiliateProfileTable.id, input.affiliateId))
		.limit(1);

	if (!affiliate) return 'SKIPPED';

	// DENIED freezes the balance for manual resolution. ON_HOLD still gets paid
	// what is already owed — blocking is forward-only.
	if (!canReceivePayout(affiliate.status as AffiliateStatus)) return 'SKIPPED';

	// No Connect account, or Stripe has not enabled payouts yet (KYC incomplete).
	// The balance simply carries until they finish onboarding.
	if (!affiliate.connectAccountId || !affiliate.payoutsEnabled) return 'SKIPPED';

	const decision = decidePayout(input.balanceCents, input.minimumCents);
	if (decision.action === 'SKIP') return 'SKIPPED';
	if (decision.action === 'ROLL_FORWARD') return 'ROLLED_FORWARD';

	// Claim the cohort first. UNIQUE(affiliate_id, cohort_month) means a
	// concurrent or repeated run gets nothing back here and stops.
	const payoutId = nanoid();
	const [payout] = await db
		.insert(affiliatePayoutTable)
		.values({
			id: payoutId,
			affiliateId: affiliate.id,
			cohortMonth: input.cohort,
			amount: centsToDollarString(decision.amountCents),
			status: 'PROCESSING',
			stripeConnectAccountId: affiliate.connectAccountId
		})
		.onConflictDoNothing()
		.returning({ id: affiliatePayoutTable.id });

	if (!payout) {
		logger.info('affiliate payout already claimed for cohort', {
			affiliateId: affiliate.id,
			cohort: input.cohort
		});
		return 'SKIPPED';
	}

	// Attach the events to this payout BEFORE transferring, so a crash mid-flight
	// leaves them owned by a PROCESSING payout that an admin can resolve, rather
	// than loose and liable to be swept into a second payout.
	const claimed = await db
		.update(affiliateCommissionEventTable)
		.set({ payoutId: payout.id, updatedAt: new Date() })
		.where(
			and(
				eq(affiliateCommissionEventTable.affiliateId, affiliate.id),
				eq(affiliateCommissionEventTable.status, 'APPROVED'),
				isNull(affiliateCommissionEventTable.payoutId)
			)
		)
		.returning({ id: affiliateCommissionEventTable.id });

	try {
		const transfer = await stripe.transfers.create(
			{
				amount: decision.amountCents,
				currency: 'usd',
				destination: affiliate.connectAccountId,
				description: `DTSS affiliate commission — ${input.cohort}`,
				metadata: { affiliateId: affiliate.id, cohortMonth: input.cohort, payoutId: payout.id }
			},
			// Stripe-side idempotency: a retried transfer returns the original
			// rather than moving money twice.
			{ idempotencyKey: `affiliate_payout:${payout.id}` }
		);

		await db
			.update(affiliatePayoutTable)
			.set({
				status: 'PAID',
				stripeTransferId: transfer.id,
				paidAt: new Date(),
				updatedAt: new Date()
			})
			.where(eq(affiliatePayoutTable.id, payout.id));

		await db
			.update(affiliateCommissionEventTable)
			.set({ status: 'PAID', updatedAt: new Date() })
			.where(eq(affiliateCommissionEventTable.payoutId, payout.id));

		logger.event('affiliate_payout_sent', {
			affiliateId: affiliate.id,
			cohort: input.cohort,
			amount: decision.amountCents / 100,
			events: claimed.length,
			stripe_transfer_id: transfer.id
		});

		return 'PAID';
	} catch (err) {
		// Never mark PAID optimistically. Release the events so the next run can
		// retry them, and leave a FAILED payout row with the Stripe error for the
		// admin console.
		await db
			.update(affiliateCommissionEventTable)
			.set({ payoutId: null, updatedAt: new Date() })
			.where(eq(affiliateCommissionEventTable.payoutId, payout.id));

		await db
			.update(affiliatePayoutTable)
			.set({
				status: 'FAILED',
				failureReason: err instanceof Error ? err.message : String(err),
				updatedAt: new Date()
			})
			.where(eq(affiliatePayoutTable.id, payout.id));

		logger.error('affiliate payout transfer failed', {
			error: err,
			affiliateId: affiliate.id,
			cohort: input.cohort
		});
		return 'FAILED';
	}
}
