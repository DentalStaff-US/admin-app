/**
 * Admin-side affiliate reads and mutations.
 *
 * Kept separate from queries/affiliates.ts (the affiliate-facing surface) so the
 * privileged operations — rate overrides, status changes, manual attribution —
 * are obvious at the import site.
 */
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
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

export type AffiliateListFilters = {
	/** Matches name, email, organization, referral code, or affiliate # (pid). */
	q?: string;
	status?: 'PENDING' | 'ACTIVE' | 'ON_HOLD' | 'DENIED';
	role?: string;
};

/** One row per affiliate for the admin list, filterable. */
export async function listAffiliatesForAdmin(
	filters: AffiliateListFilters = {},
	limit = 100,
	offset = 0
) {
	const where = [];
	const q = filters.q?.trim();
	if (q) {
		const like = `%${q}%`;
		const asPid = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
		where.push(
			or(
				ilike(userTable.name, like),
				ilike(userTable.email, like),
				ilike(affiliateProfileTable.organizationName, like),
				ilike(affiliateProfileTable.contactEmail, like),
				ilike(affiliateReferralCodeTable.code, like),
				...(asPid !== null ? [eq(affiliateProfileTable.pid, asPid)] : [])
			)
		);
	}
	if (filters.status) where.push(eq(affiliateProfileTable.status, filters.status));
	if (filters.role) where.push(eq(userTable.role, filters.role));

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
		.where(where.length ? and(...where) : undefined)
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

/**
 * Manual ledger adjustment — the support tool for "the numbers are wrong".
 *
 * ALWAYS an additive row, never an edit: the ledger is append-only and a
 * correction must be visible as a correction. Positive credits the affiliate,
 * negative debits them. Written as APPROVED in the CURRENT cohort so it nets
 * against the very next payout run.
 *
 * Idempotent per (affiliate, reason, day) via the idempotency key, so a
 * double-submitted form cannot double-adjust.
 */
export async function recordManualAdjustment(input: {
	affiliateId: string;
	amountDollars: string;
	reason: string;
	setBy: string;
}): Promise<{ created: boolean; eventId: string | null }> {
	const cents = Math.round(Number(input.amountDollars) * 100);
	if (!Number.isFinite(cents) || cents === 0)
		throw new Error('Adjustment must be a non-zero amount');

	const today = new Date().toISOString().slice(0, 10);
	const key = `manual_adjustment:${input.affiliateId}:${today}:${input.reason.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 60)}`;

	const [row] = await db
		.insert(affiliateCommissionEventTable)
		.values({
			id: nanoid(),
			affiliateId: input.affiliateId,
			sourceType: 'MANUAL_ADJUSTMENT',
			grossAmount: '0.00',
			commissionAmount: (cents / 100).toFixed(2),
			status: 'APPROVED',
			cohortMonth: today.slice(0, 7) + '-01',
			revenueAt: new Date(),
			idempotencyKey: key,
			notes: `Manual adjustment by admin ${input.setBy}: ${input.reason}`
		})
		.onConflictDoNothing({ target: affiliateCommissionEventTable.idempotencyKey })
		.returning({ id: affiliateCommissionEventTable.id });

	logger.info('affiliate manual adjustment', {
		affiliateId: input.affiliateId,
		amount: input.amountDollars,
		reason: input.reason,
		setBy: input.setBy,
		created: Boolean(row)
	});

	return { created: Boolean(row), eventId: row?.id ?? null };
}

/* -------------------------------------------------------------------------- */
/* Single-affiliate detail (admin)                                            */
/* -------------------------------------------------------------------------- */

export async function getAffiliateDetailForAdmin(affiliateId: string) {
	const [profile] = await db
		.select({
			id: affiliateProfileTable.id,
			pid: affiliateProfileTable.pid,
			userId: affiliateProfileTable.userId,
			status: affiliateProfileTable.status,
			statusReason: affiliateProfileTable.statusReason,
			statusSetManually: affiliateProfileTable.statusSetManually,
			commissionRateOverride: affiliateProfileTable.commissionRateOverride,
			overrideReason: affiliateProfileTable.overrideReason,
			overrideSetAt: affiliateProfileTable.overrideSetAt,
			displayName: affiliateProfileTable.displayName,
			organizationName: affiliateProfileTable.organizationName,
			website: affiliateProfileTable.website,
			contactEmail: affiliateProfileTable.contactEmail,
			stripeConnectAccountId: affiliateProfileTable.stripeConnectAccountId,
			connectPayoutsEnabled: affiliateProfileTable.connectPayoutsEnabled,
			connectDetailsSubmitted: affiliateProfileTable.connectDetailsSubmitted,
			connectRequirementsDue: affiliateProfileTable.connectRequirementsDue,
			notes: affiliateProfileTable.notes,
			createdAt: affiliateProfileTable.createdAt,
			name: userTable.name,
			email: userTable.email,
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
		.where(eq(affiliateProfileTable.id, affiliateId))
		.limit(1);

	if (!profile) return null;

	const [referrals, ledger, payouts, totals] = await Promise.all([
		db
			.select({
				id: affiliateReferralTable.id,
				status: affiliateReferralTable.status,
				attributionSource: affiliateReferralTable.attributionSource,
				referredRole: affiliateReferralTable.referredRole,
				flaggedReason: affiliateReferralTable.flaggedReason,
				rejectedReason: affiliateReferralTable.rejectedReason,
				signedUpAt: affiliateReferralTable.signedUpAt,
				referredUserId: affiliateReferralTable.referredUserId,
				referredName: userTable.name,
				referredEmail: userTable.email
			})
			.from(affiliateReferralTable)
			.innerJoin(userTable, eq(affiliateReferralTable.referredUserId, userTable.id))
			.where(eq(affiliateReferralTable.affiliateId, affiliateId))
			.orderBy(desc(affiliateReferralTable.signedUpAt)),
		db
			.select()
			.from(affiliateCommissionEventTable)
			.where(eq(affiliateCommissionEventTable.affiliateId, affiliateId))
			.orderBy(desc(affiliateCommissionEventTable.createdAt))
			.limit(200),
		db
			.select()
			.from(affiliatePayoutTable)
			.where(eq(affiliatePayoutTable.affiliateId, affiliateId))
			.orderBy(desc(affiliatePayoutTable.createdAt)),
		db
			.select({
				status: affiliateCommissionEventTable.status,
				total: sql<string>`coalesce(sum(${affiliateCommissionEventTable.commissionAmount}), 0)::text`
			})
			.from(affiliateCommissionEventTable)
			.where(eq(affiliateCommissionEventTable.affiliateId, affiliateId))
			.groupBy(affiliateCommissionEventTable.status)
	]);

	const pick = (s: string) => totals.find((t) => t.status === s)?.total ?? '0';
	const [unpaid] = await db
		.select({
			total: sql<string>`coalesce(sum(${affiliateCommissionEventTable.commissionAmount}), 0)::text`
		})
		.from(affiliateCommissionEventTable)
		.where(
			and(
				eq(affiliateCommissionEventTable.affiliateId, affiliateId),
				eq(affiliateCommissionEventTable.status, 'APPROVED'),
				sql`${affiliateCommissionEventTable.payoutId} is null`
			)
		);

	return {
		profile,
		referrals,
		ledger,
		payouts,
		totals: {
			pending: pick('PENDING'),
			approved: pick('APPROVED'),
			paid: pick('PAID'),
			reversed: pick('REVERSED'),
			unpaidApproved: unpaid?.total ?? '0'
		}
	};
}
