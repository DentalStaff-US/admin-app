/**
 * Admin-side affiliate reads and mutations.
 *
 * Kept separate from queries/affiliates.ts (the affiliate-facing surface) so the
 * privileged operations — rate overrides, status changes, manual attribution —
 * are obvious at the import site.
 */
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import db from '$lib/server/database/drizzle';
import {
	affiliateProfileTable,
	affiliateReferralCodeTable,
	affiliateReferralTable,
	affiliateCommissionEventTable,
	affiliatePayoutTable
} from '$lib/server/database/schemas/affiliate';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { userTable } from '$lib/server/database/schemas/auth';
import type { AffiliateStatus } from '$lib/server/affiliate/eligibility';
import { logger } from '$lib/server/logger';

/** One row per affiliate for the admin list, with lifetime totals. */
export async function listAffiliatesForAdmin(limit = 100, offset = 0) {
	return db
		.select({
			id: affiliateProfileTable.id,
			pid: affiliateProfileTable.pid,
			userId: affiliateProfileTable.userId,
			status: affiliateProfileTable.status,
			statusReason: affiliateProfileTable.statusReason,
			statusSetManually: affiliateProfileTable.statusSetManually,
			commissionRateOverride: affiliateProfileTable.commissionRateOverride,
			connectPayoutsEnabled: affiliateProfileTable.connectPayoutsEnabled,
			stripeConnectAccountId: affiliateProfileTable.stripeConnectAccountId,
			createdAt: affiliateProfileTable.createdAt,
			name: userTable.name,
			email: userTable.email,
			// Affiliate "type" is not stored — it is derived from users.role.
			role: userTable.role,
			code: affiliateReferralCodeTable.code
		})
		.from(affiliateProfileTable)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.leftJoin(
			affiliateReferralCodeTable,
			and(
				eq(affiliateReferralCodeTable.affiliateId, affiliateProfileTable.id),
				eq(affiliateReferralCodeTable.isPrimary, true)
			)
		)
		.orderBy(desc(affiliateProfileTable.createdAt))
		.limit(limit)
		.offset(offset);
}

/** Program-wide totals for the admin overview. */
export async function getAffiliateProgramTotals() {
	const [affiliates] = await db.select({ value: count() }).from(affiliateProfileTable);

	const [referrals] = await db
		.select({ value: count() })
		.from(affiliateReferralTable)
		.where(eq(affiliateReferralTable.status, 'QUALIFIED'));

	const [flagged] = await db
		.select({ value: count() })
		.from(affiliateReferralTable)
		.where(eq(affiliateReferralTable.status, 'PENDING'));

	const ledger = await db
		.select({
			status: affiliateCommissionEventTable.status,
			total: sql<string>`coalesce(sum(${affiliateCommissionEventTable.commissionAmount}), 0)::text`
		})
		.from(affiliateCommissionEventTable)
		.groupBy(affiliateCommissionEventTable.status);

	const pick = (s: string) => ledger.find((r) => r.status === s)?.total ?? '0';

	return {
		affiliates: affiliates?.value ?? 0,
		qualifiedReferrals: referrals?.value ?? 0,
		flaggedReferrals: flagged?.value ?? 0,
		pending: pick('PENDING'),
		approved: pick('APPROVED'),
		paid: pick('PAID'),
		reversed: pick('REVERSED')
	};
}

/** Recent payout runs across all affiliates, including failures. */
export async function listRecentPayouts(limit = 50) {
	return db
		.select({
			id: affiliatePayoutTable.id,
			affiliateId: affiliatePayoutTable.affiliateId,
			cohortMonth: affiliatePayoutTable.cohortMonth,
			amount: affiliatePayoutTable.amount,
			status: affiliatePayoutTable.status,
			failureReason: affiliatePayoutTable.failureReason,
			stripeTransferId: affiliatePayoutTable.stripeTransferId,
			paidAt: affiliatePayoutTable.paidAt,
			name: userTable.name,
			email: userTable.email
		})
		.from(affiliatePayoutTable)
		.innerJoin(
			affiliateProfileTable,
			eq(affiliatePayoutTable.affiliateId, affiliateProfileTable.id)
		)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.orderBy(desc(affiliatePayoutTable.createdAt))
		.limit(limit);
}

/**
 * Referral metadata: who referred whom. `referrer` is the payee, `referred` is
 * the account whose activity generates the commission.
 */
export async function listReferralsForAdmin(limit = 100, offset = 0) {
	return db
		.select({
			id: affiliateReferralTable.id,
			status: affiliateReferralTable.status,
			attributionSource: affiliateReferralTable.attributionSource,
			flaggedReason: affiliateReferralTable.flaggedReason,
			rejectedReason: affiliateReferralTable.rejectedReason,
			referredRole: affiliateReferralTable.referredRole,
			signedUpAt: affiliateReferralTable.signedUpAt,
			affiliateId: affiliateReferralTable.affiliateId,
			affiliatePid: affiliateProfileTable.pid,
			referredUserId: affiliateReferralTable.referredUserId,
			referredEmail: userTable.email,
			referredName: userTable.name
		})
		.from(affiliateReferralTable)
		.innerJoin(
			affiliateProfileTable,
			eq(affiliateReferralTable.affiliateId, affiliateProfileTable.id)
		)
		.innerJoin(userTable, eq(affiliateReferralTable.referredUserId, userTable.id))
		.orderBy(desc(affiliateReferralTable.signedUpAt))
		.limit(limit)
		.offset(offset);
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

/** Program-wide settings. Rate changes are FORWARD-ONLY — see ruleSnapshot. */
export async function updateAffiliateProgramSettings(input: {
	commissionRate: string;
	payoutMinimum: string;
	programEnabled: boolean;
}) {
	const [config] = await db.select({ id: adminConfigTable.id }).from(adminConfigTable).limit(1);
	if (!config) throw new Error('admin_config row is missing');

	await db
		.update(adminConfigTable)
		.set({
			affiliateCommissionRate: input.commissionRate,
			affiliatePayoutMinimum: input.payoutMinimum,
			affiliateProgramEnabled: input.programEnabled,
			updatedAt: new Date()
		})
		.where(eq(adminConfigTable.id, config.id));

	logger.info('affiliate program settings updated', input);
}

/**
 * Per-affiliate negotiated rate. Pass null to clear and fall back to the program
 * default. Forward-only: existing ledger rows keep their own rule snapshot.
 */
export async function setAffiliateRateOverride(input: {
	affiliateId: string;
	ratePercent: string | null;
	reason: string | null;
	setBy: string;
}) {
	await db
		.update(affiliateProfileTable)
		.set({
			commissionRateOverride: input.ratePercent,
			overrideReason: input.reason,
			overrideSetBy: input.setBy,
			overrideSetAt: new Date(),
			updatedAt: new Date()
		})
		.where(eq(affiliateProfileTable.id, input.affiliateId));

	logger.info('affiliate rate override changed', {
		affiliateId: input.affiliateId,
		ratePercent: input.ratePercent,
		setBy: input.setBy
	});
}

/**
 * Admin status change.
 *
 * Sets `statusSetManually` so the nightly eligibility sync will not silently
 * undo the decision. ON_HOLD stops NEW accrual but still pays out what is owed;
 * DENIED is terminal and freezes the balance.
 */
export async function setAffiliateStatus(input: {
	affiliateId: string;
	status: AffiliateStatus;
	reason: string;
	setBy: string;
}) {
	await db
		.update(affiliateProfileTable)
		.set({
			status: input.status,
			statusReason: input.reason,
			statusSetManually: true,
			...(input.status === 'ACTIVE' ? { approvedAt: new Date(), approvedBy: input.setBy } : {}),
			updatedAt: new Date()
		})
		.where(eq(affiliateProfileTable.id, input.affiliateId));

	logger.info('affiliate status set by admin', {
		affiliateId: input.affiliateId,
		status: input.status,
		setBy: input.setBy
	});
}

/** Resolve a flagged referral after human review. */
export async function resolveFlaggedReferral(input: {
	referralId: string;
	approve: boolean;
	reason: string;
}) {
	await db
		.update(affiliateReferralTable)
		.set({
			status: input.approve ? 'QUALIFIED' : 'REJECTED',
			...(input.approve ? { flaggedReason: null } : { rejectedReason: input.reason }),
			updatedAt: new Date()
		})
		.where(eq(affiliateReferralTable.id, input.referralId));
}

/**
 * Manually attribute an off-platform referral (a spreadsheet deal, a verbal
 * arrangement). Respects UNIQUE(referred_user_id), so it cannot overwrite an
 * existing referral — a user's attribution is permanent.
 */
export async function manuallyAttributeReferral(input: {
	affiliateId: string;
	referredUserId: string;
	referredRole: string;
	note: string;
}): Promise<{ created: boolean }> {
	const [row] = await db
		.insert(affiliateReferralTable)
		.values({
			id: nanoid(),
			affiliateId: input.affiliateId,
			referredUserId: input.referredUserId,
			referredRole: input.referredRole,
			attributionSource: 'MANUAL',
			status: 'QUALIFIED',
			flaggedReason: null,
			rejectedReason: null,
			signedUpAt: new Date()
		})
		.onConflictDoNothing({ target: affiliateReferralTable.referredUserId })
		.returning({ id: affiliateReferralTable.id });

	logger.info('affiliate referral manually attributed', {
		affiliateId: input.affiliateId,
		referredUserId: input.referredUserId,
		created: Boolean(row),
		note: input.note
	});

	return { created: Boolean(row) };
}
