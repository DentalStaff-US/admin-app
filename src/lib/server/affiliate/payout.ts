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
import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
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
import {
	payableCohortAsOf,
	parseCohortMonth,
	decidePayout,
	dollarsToCents
} from '$lib/server/affiliate/payoutCycle';
import { centsToDollarString } from '$lib/server/affiliate/commission';
import { notifyPayoutSent, notifyAdminsPayoutFailures } from '$lib/server/affiliate/notifications';
import { userTable } from '$lib/server/database/schemas/auth';
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

	const failures: Array<{ affiliateId: string; amount: string; reason: string | null }> = [];

	for (const balance of balances) {
		const cents = Number(balance.totalCents ?? 0);
		try {
			const outcome = await payOneAffiliate({
				affiliateId: balance.affiliateId,
				balanceCents: cents,
				minimumCents,
				cohort
			});
			if (outcome.kind === 'PAID') {
				result.paid++;
				result.totalPaidCents += cents;
				// Fire-and-forget; a notification failure never affects the ledger.
				void notifyPayoutSent({
					affiliateId: balance.affiliateId,
					amount: centsToDollarString(cents),
					cohortLabel: cohortLabel(cohort)
				});
			} else if (outcome.kind === 'ROLLED_FORWARD') result.rolledForward++;
			else if (outcome.kind === 'FAILED') {
				result.failed++;
				failures.push({
					affiliateId: balance.affiliateId,
					amount: centsToDollarString(cents),
					reason: outcome.reason
				});
			} else result.skipped++;
		} catch (err) {
			// One affiliate's failure must never abort the whole run.
			result.failed++;
			failures.push({
				affiliateId: balance.affiliateId,
				amount: centsToDollarString(cents),
				reason: err instanceof Error ? err.message : String(err)
			});
			logger.error('affiliate payout failed', { error: err, affiliateId: balance.affiliateId });
		}
	}

	// Any failure needs a human: the common cause (insufficient platform balance)
	// cannot be fixed by code. The nightly reconcile retries once it's addressed.
	if (failures.length > 0) {
		const withEmails = await attachAffiliateEmails(failures);
		void notifyAdminsPayoutFailures({ cohort, failures: withEmails });
	}

	return result;
}

/** "August 2026" for a cohort key. */
function cohortLabel(cohort: string): string {
	const { year, month } = parseCohortMonth(cohort);
	return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric'
	});
}

async function attachAffiliateEmails(
	failures: Array<{ affiliateId: string; amount: string; reason: string | null }>
) {
	const rows = await db
		.select({ id: affiliateProfileTable.id, email: userTable.email })
		.from(affiliateProfileTable)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.where(
			inArray(
				affiliateProfileTable.id,
				failures.map((f) => f.affiliateId)
			)
		);
	const byId = new Map(rows.map((r) => [r.id, r.email]));
	return failures.map((f) => ({
		affiliateEmail: byId.get(f.affiliateId) ?? f.affiliateId,
		amount: f.amount,
		reason: f.reason
	}));
}

type PayoutOutcome =
	| { kind: 'PAID' }
	| { kind: 'ROLLED_FORWARD' }
	| { kind: 'SKIPPED' }
	| { kind: 'FAILED'; reason: string | null };

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

	if (!affiliate) return { kind: 'SKIPPED' };

	// DENIED freezes the balance for manual resolution. ON_HOLD still gets paid
	// what is already owed — blocking is forward-only.
	if (!canReceivePayout(affiliate.status as AffiliateStatus)) return { kind: 'SKIPPED' };

	// No Connect account, or Stripe has not enabled payouts yet (KYC incomplete).
	// The balance simply carries until they finish onboarding.
	if (!affiliate.connectAccountId || !affiliate.payoutsEnabled) return { kind: 'SKIPPED' };

	const decision = decidePayout(input.balanceCents, input.minimumCents);
	if (decision.action === 'SKIP') return { kind: 'SKIPPED' };
	if (decision.action === 'ROLL_FORWARD') return { kind: 'ROLLED_FORWARD' };

	// Claim the cohort. UNIQUE(affiliate_id, cohort_month) is one of the three
	// double-pay defences — but a previous FAILED attempt (insufficient platform
	// balance, Stripe outage) must be RETRYABLE, not permanently blocking. So:
	//   PAID / PROCESSING row exists → genuinely claimed, stop.
	//   FAILED row exists            → reuse it and try again.
	//   nothing                      → claim fresh.
	const [existing] = await db
		.select({ id: affiliatePayoutTable.id, status: affiliatePayoutTable.status })
		.from(affiliatePayoutTable)
		.where(
			and(
				eq(affiliatePayoutTable.affiliateId, affiliate.id),
				eq(affiliatePayoutTable.cohortMonth, input.cohort)
			)
		)
		.limit(1);

	let payout: { id: string };

	if (existing && existing.status !== 'FAILED') {
		logger.info('affiliate payout already claimed for cohort', {
			affiliateId: affiliate.id,
			cohort: input.cohort,
			status: existing.status
		});
		return { kind: 'SKIPPED' };
	} else if (existing) {
		await db
			.update(affiliatePayoutTable)
			.set({
				status: 'PROCESSING',
				amount: centsToDollarString(decision.amountCents),
				failureReason: null,
				stripeConnectAccountId: affiliate.connectAccountId,
				updatedAt: new Date()
			})
			.where(eq(affiliatePayoutTable.id, existing.id));
		payout = { id: existing.id };
		logger.info('affiliate payout retrying previously failed cohort', {
			affiliateId: affiliate.id,
			cohort: input.cohort
		});
	} else {
		const [inserted] = await db
			.insert(affiliatePayoutTable)
			.values({
				id: nanoid(),
				affiliateId: affiliate.id,
				cohortMonth: input.cohort,
				amount: centsToDollarString(decision.amountCents),
				status: 'PROCESSING',
				stripeConnectAccountId: affiliate.connectAccountId
			})
			.onConflictDoNothing()
			.returning({ id: affiliatePayoutTable.id });
		if (!inserted) return { kind: 'SKIPPED' }; // lost a race — the advisory lock makes this near-impossible
		payout = inserted;
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
			// Stripe-side idempotency guards stripe-node's own network retries within
			// this attempt. It is scoped per ATTEMPT (not per payout) on purpose: a
			// later retry of a FAILED payout must be a fresh request, not a replay of
			// the cached failure. Cross-run double-pay is prevented by the DB unique
			// and the advisory lock, not by this key.
			{ idempotencyKey: `affiliate_payout:${payout.id}:${Date.now()}` }
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

		return { kind: 'PAID' };
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
		return { kind: 'FAILED', reason: err instanceof Error ? err.message : String(err) };
	}
}
