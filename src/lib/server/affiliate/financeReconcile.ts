/**
 * Nightly affiliate finance reconciliation.
 *
 * Two jobs that share the same reason for existing: the primary mechanism is
 * event-driven and can be missed, so a sweep catches what slipped through.
 *
 * 1. CONNECT FLAGS — re-sync every connected account from Stripe. The primary
 *    path is the `account.updated` webhook; the portal `summary` self-heals on
 *    visit. This catches affiliates who never come back to the portal.
 *
 * 2. FAILED PAYOUT RETRY — re-attempt any payout that failed recently. The
 *    dominant cause is an underfunded platform balance; once someone tops it
 *    up, this moves the money the next night instead of next month.
 *    Retry is safe: payOneAffiliate reuses the FAILED row, the advisory lock
 *    prevents overlap, and the transfer gets a fresh idempotency key.
 */
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	affiliatePayoutTable,
	affiliateProfileTable
} from '$lib/server/database/schemas/affiliate';
import { reconcileConnectFromStripe } from '$lib/server/affiliate/connect';
import { runAffiliatePayouts } from '$lib/server/affiliate/payout';
import { logger } from '$lib/server/logger';

export type FinanceReconcileResult = {
	connectSynced: number;
	connectChanged: number;
	connectErrors: number;
	failedPayoutsFound: number;
	retryRun: Awaited<ReturnType<typeof runAffiliatePayouts>> | null;
};

const RETRY_WINDOW_DAYS = 60;

export async function reconcileAffiliateFinance(
	now: Date = new Date()
): Promise<FinanceReconcileResult> {
	const result: FinanceReconcileResult = {
		connectSynced: 0,
		connectChanged: 0,
		connectErrors: 0,
		failedPayoutsFound: 0,
		retryRun: null
	};

	// --- 1. Connect flags -----------------------------------------------------
	const connected = await db
		.select({
			id: affiliateProfileTable.id,
			payoutsEnabled: affiliateProfileTable.connectPayoutsEnabled
		})
		.from(affiliateProfileTable)
		.where(isNotNull(affiliateProfileTable.stripeConnectAccountId));

	for (const a of connected) {
		try {
			const fresh = await reconcileConnectFromStripe(a.id);
			result.connectSynced++;
			if (fresh && fresh.payoutsEnabled !== a.payoutsEnabled) result.connectChanged++;
		} catch (err) {
			result.connectErrors++;
			logger.warn('nightly connect reconcile failed for affiliate', {
				error: err,
				affiliateId: a.id
			});
		}
	}

	// --- 2. Retry recent FAILED payouts ----------------------------------------
	const since = new Date(now.getTime() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
	const failed = await db
		.select({ id: affiliatePayoutTable.id })
		.from(affiliatePayoutTable)
		.where(
			and(eq(affiliatePayoutTable.status, 'FAILED'), gte(affiliatePayoutTable.updatedAt, since))
		)
		.orderBy(desc(affiliatePayoutTable.updatedAt));

	result.failedPayoutsFound = failed.length;

	if (failed.length > 0) {
		// runAffiliatePayouts already knows how to reuse FAILED rows; running it
		// re-attempts every matured cohort with an outstanding balance, which by
		// construction includes the failed ones.
		result.retryRun = await runAffiliatePayouts(now);
		logger.info('nightly payout retry completed', { ...result.retryRun });
	}

	return result;
}

/**
 * Pre-payout heads-up: what each affiliate will receive on the NEXT run, for
 * the "your payout is coming" email.
 *
 * Only counts events in cohorts that will have MATURED by that run — a PENDING
 * event from this month is real money, but it isn't in the upcoming payout.
 * And only affiliates who will actually be paid: Connect ready, positive
 * balance, at or above the floor.
 */
export async function upcomingPayoutPreview(input: {
	/** The cohort the next run will settle — payableCohortAsOf(the next 1st). */
	payableCohort: string;
	minimumCents: number;
}) {
	const rows = await db.execute(sql`
		select
			a.id as affiliate_id,
			round(sum(e.commission_amount) * 100)::int as cents
		from affiliate_commission_events e
		join affiliate_profiles a on a.id = e.affiliate_id
		where e.payout_id is null
		  and (
		        (e.status = 'PENDING'  and e.cohort_month <= ${input.payableCohort}::date)
		     or  e.status = 'APPROVED'
		  )
		  and a.status in ('ACTIVE', 'ON_HOLD')
		  and a.connect_payouts_enabled = true
		group by a.id
		having round(sum(e.commission_amount) * 100)::int >= ${input.minimumCents}
	`);
	return (rows as unknown as { rows: Array<{ affiliate_id: string; cents: number }> }).rows;
}
