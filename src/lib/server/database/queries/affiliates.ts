/**
 * Affiliate data access.
 *
 * This module is the IMPURE half of the affiliate system: it reads and writes,
 * but it does not decide. All branching lives in the pure modules under
 * src/lib/server/affiliate/ so it can be unit-tested with zero mocking.
 *
 * The ledger is APPEND-ONLY — corrections are new rows, never edits or deletes.
 */
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import db from '$lib/server/database/drizzle';
import {
	affiliateProfileTable,
	affiliateReferralCodeTable,
	affiliateReferralClickTable,
	affiliateReferralTable,
	affiliateCommissionEventTable,
	affiliatePayoutTable
} from '$lib/server/database/schemas/affiliate';
import { userTable } from '$lib/server/database/schemas/auth';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { normalizeCode } from '$lib/server/affiliate/code';
import { decideEligibility, type AffiliateStatus } from '$lib/server/affiliate/eligibility';
import type { AttributionDecision } from '$lib/server/affiliate/attribution';
import { logger } from '$lib/server/logger';
import { getAffiliateByUserId, getInternalProfileStatus } from '$lib/server/affiliate/enroll';

// Enrolment lives in affiliate/enroll.ts so it stays importable from tsx-run
// scripts (this module imports `logger`, which imports $app/environment).
export {
	ensureAffiliateProfile,
	issuePrimaryCode,
	getAffiliateByUserId,
	getPrimaryCode,
	getInternalProfileStatus
} from '$lib/server/affiliate/enroll';

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

export type AffiliateConfig = {
	commissionRate: string;
	payoutMinimum: string;
	programEnabled: boolean;
};

/**
 * admin_config is a singleton row. Falls back to the schema defaults rather than
 * throwing, so a missing config row can never silently halt accrual.
 */
export async function getAffiliateConfig(): Promise<AffiliateConfig> {
	const [row] = await db
		.select({
			commissionRate: adminConfigTable.affiliateCommissionRate,
			payoutMinimum: adminConfigTable.affiliatePayoutMinimum,
			programEnabled: adminConfigTable.affiliateProgramEnabled
		})
		.from(adminConfigTable)
		.limit(1);

	return {
		commissionRate: row?.commissionRate ?? '2.50',
		payoutMinimum: row?.payoutMinimum ?? '25.00',
		programEnabled: row?.programEnabled ?? false
	};
}

/* -------------------------------------------------------------------------- */
/* Profile reads                                                              */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Enrollment                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Idempotently give a user an affiliate profile and a permanent primary code.
 *
 * Safe to call repeatedly — the backfill script, the portal's first load, and
 * the external-partner application flow all funnel through here.
 *
 * The initial status is DERIVED, not assumed: an internal user whose profile is
 * not ACTIVE enrolls straight to ON_HOLD and never receives a working link.
 */
/* -------------------------------------------------------------------------- */
/* Eligibility                                                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Code resolution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a referral code to its affiliate. Used at both click time and consume
 * time. Returns the shape `decideAttribution` expects — including the owner's
 * login email, which the self-referral guard compares against.
 */
export async function resolveCode(rawCode: string) {
	const normalized = normalizeCode(rawCode);

	const [row] = await db
		.select({
			codeId: affiliateReferralCodeTable.id,
			codeActive: affiliateReferralCodeTable.active,
			affiliateId: affiliateProfileTable.id,
			affiliateUserId: affiliateProfileTable.userId,
			affiliateStatus: affiliateProfileTable.status,
			contactEmail: affiliateProfileTable.contactEmail,
			ownerEmail: userTable.email
		})
		.from(affiliateReferralCodeTable)
		.innerJoin(
			affiliateProfileTable,
			eq(affiliateReferralCodeTable.affiliateId, affiliateProfileTable.id)
		)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id))
		.where(eq(affiliateReferralCodeTable.codeNormalized, normalized))
		.limit(1);

	if (!row) return null;

	return {
		code: { id: row.codeId, active: row.codeActive },
		affiliate: {
			id: row.affiliateId,
			userId: row.affiliateUserId,
			status: row.affiliateStatus as AffiliateStatus,
			contactEmail: row.contactEmail,
			ownerEmail: row.ownerEmail
		}
	};
}

/**
 * Re-derive one affiliate's status from its underlying account and persist any
 * change. Call this wherever a client/candidate status is written.
 *
 * No-ops when the user is not an affiliate, so call sites need no guard.
 */
export async function syncAffiliateEligibility(userId: string): Promise<AffiliateStatus | null> {
	const affiliate = await getAffiliateByUserId(userId);
	if (!affiliate) return null;

	const [user] = await db
		.select({ role: userTable.role })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);
	if (!user) return affiliate.status as AffiliateStatus;

	const profileStatus = await getInternalProfileStatus(userId, user.role);

	const decision = decideEligibility({
		role: user.role,
		profileStatus,
		currentStatus: affiliate.status as AffiliateStatus,
		statusSetManually: affiliate.statusSetManually
	});

	if (!decision.changed) return decision.status;

	await db
		.update(affiliateProfileTable)
		.set({
			status: decision.status,
			statusReason: decision.reason,
			updatedAt: new Date()
		})
		.where(eq(affiliateProfileTable.id, affiliate.id));

	logger.info('affiliate eligibility synced', {
		affiliateId: affiliate.id,
		from: affiliate.status,
		to: decision.status,
		reason: decision.reason
	});

	return decision.status;
}

/* -------------------------------------------------------------------------- */
/* Clicks                                                                     */
/* -------------------------------------------------------------------------- */

export async function recordClick(input: {
	codeId: string | null;
	affiliateId: string | null;
	ipHash: string | null;
	userAgentHash: string | null;
	userAgent: string | null;
	referer: string | null;
	landingHost: string | null;
	landingPath: string | null;
	utmSource?: string | null;
	utmMedium?: string | null;
	utmCampaign?: string | null;
	isBot: boolean;
	botReason?: string | null;
}): Promise<number | null> {
	const [row] = await db
		.insert(affiliateReferralClickTable)
		.values({ ...input, botReason: input.botReason ?? null })
		.returning({ id: affiliateReferralClickTable.id });
	return row?.id ?? null;
}

/** Most recent non-bot click matching the dedupe key, for the 30-minute window. */
export async function findRecentClick(
	codeId: string,
	ipHash: string | null,
	userAgentHash: string | null,
	since: Date
): Promise<Date | null> {
	if (!ipHash) return null;
	const [row] = await db
		.select({ createdAt: affiliateReferralClickTable.createdAt })
		.from(affiliateReferralClickTable)
		.where(
			and(
				eq(affiliateReferralClickTable.codeId, codeId),
				eq(affiliateReferralClickTable.ipHash, ipHash),
				userAgentHash
					? eq(affiliateReferralClickTable.userAgentHash, userAgentHash)
					: isNull(affiliateReferralClickTable.userAgentHash),
				eq(affiliateReferralClickTable.isBot, false),
				gt(affiliateReferralClickTable.createdAt, since)
			)
		)
		.orderBy(desc(affiliateReferralClickTable.createdAt))
		.limit(1);
	return row?.createdAt ?? null;
}

/* -------------------------------------------------------------------------- */
/* Attribution                                                                */
/* -------------------------------------------------------------------------- */

export async function hasReferral(referredUserId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: affiliateReferralTable.id })
		.from(affiliateReferralTable)
		.where(eq(affiliateReferralTable.referredUserId, referredUserId))
		.limit(1);
	return !!row;
}

/**
 * Execute an attribution decision. Contains NO branching beyond dispatching on
 * `action` — every rule was already applied by `decideAttribution`.
 *
 * `tx` lets the admin-app signup path run this inside the same transaction that
 * patches role/verified, so a user is either fully set up and attributed or
 * neither.
 *
 * The insert is ON CONFLICT DO NOTHING against UNIQUE(referred_user_id), which
 * makes the whole operation idempotent — the candidate-app path is an HTTP call
 * that can be retried.
 */
export async function applyAttribution(
	decision: AttributionDecision,
	input: { referredUserId: string; referredRole: string },
	tx: Pick<typeof db, 'insert'> = db
): Promise<{ written: boolean }> {
	if (decision.action === 'SKIP') return { written: false };

	if (decision.action === 'REJECT') {
		await tx
			.insert(affiliateReferralTable)
			.values({
				id: nanoid(),
				affiliateId: decision.affiliateId,
				codeId: decision.codeId,
				referredUserId: input.referredUserId,
				referredRole: input.referredRole,
				attributionSource: 'COOKIE',
				status: 'REJECTED',
				rejectedReason: decision.reason
			})
			.onConflictDoNothing({ target: affiliateReferralTable.referredUserId });
		return { written: true };
	}

	await tx
		.insert(affiliateReferralTable)
		.values({
			id: nanoid(),
			affiliateId: decision.affiliateId,
			codeId: decision.codeId,
			referredUserId: input.referredUserId,
			referredRole: input.referredRole,
			attributionSource: decision.source,
			clickId: decision.clickId,
			status: decision.status,
			flaggedReason: decision.flaggedReason ?? null,
			firstTouchAt: decision.firstTouchAt
		})
		.onConflictDoNothing({ target: affiliateReferralTable.referredUserId });

	return { written: true };
}

/**
 * The affiliates who should earn on an invoice: whoever referred the paying
 * practice, and whoever referred the professional who worked the shift.
 *
 * Both may exist and be DIFFERENT affiliates — each earns on their own side, via
 * two ledger rows with distinct idempotency keys.
 *
 * Only QUALIFIED referrals earn; PENDING (flagged, awaiting review) and REJECTED
 * do not.
 */
export async function findEarningAffiliates(input: {
	clientUserId: string | null;
	candidateUserId: string | null;
}): Promise<Array<{ affiliateId: string; referralId: string; referredUserId: string }>> {
	const userIds = [input.clientUserId, input.candidateUserId].filter((v): v is string => !!v);
	if (userIds.length === 0) return [];

	const rows = await db
		.select({
			affiliateId: affiliateReferralTable.affiliateId,
			referralId: affiliateReferralTable.id,
			referredUserId: affiliateReferralTable.referredUserId,
			affiliateStatus: affiliateProfileTable.status
		})
		.from(affiliateReferralTable)
		.innerJoin(
			affiliateProfileTable,
			eq(affiliateReferralTable.affiliateId, affiliateProfileTable.id)
		)
		.where(
			and(
				inArray(affiliateReferralTable.referredUserId, userIds),
				eq(affiliateReferralTable.status, 'QUALIFIED')
			)
		);

	// Only ACTIVE affiliates accrue new commission (canAccrue); a held or denied
	// affiliate keeps its earned balance but earns nothing further.
	return rows
		.filter((r) => r.affiliateStatus === 'ACTIVE')
		.map(({ affiliateId, referralId, referredUserId }) => ({
			affiliateId,
			referralId,
			referredUserId
		}));
}

/* -------------------------------------------------------------------------- */
/* Ledger reads                                                               */
/* -------------------------------------------------------------------------- */

export async function listReferrals(affiliateId: string, limit = 50, offset = 0) {
	return db
		.select({
			id: affiliateReferralTable.id,
			referredUserId: affiliateReferralTable.referredUserId,
			referredRole: affiliateReferralTable.referredRole,
			status: affiliateReferralTable.status,
			attributionSource: affiliateReferralTable.attributionSource,
			flaggedReason: affiliateReferralTable.flaggedReason,
			rejectedReason: affiliateReferralTable.rejectedReason,
			signedUpAt: affiliateReferralTable.signedUpAt,
			referredName: userTable.name,
			referredEmail: userTable.email
		})
		.from(affiliateReferralTable)
		.innerJoin(userTable, eq(affiliateReferralTable.referredUserId, userTable.id))
		.where(eq(affiliateReferralTable.affiliateId, affiliateId))
		.orderBy(desc(affiliateReferralTable.signedUpAt))
		.limit(limit)
		.offset(offset);
}

export async function listLedger(affiliateId: string, limit = 50, offset = 0) {
	return db
		.select()
		.from(affiliateCommissionEventTable)
		.where(eq(affiliateCommissionEventTable.affiliateId, affiliateId))
		.orderBy(desc(affiliateCommissionEventTable.revenueAt))
		.limit(limit)
		.offset(offset);
}

export async function listPayouts(affiliateId: string, limit = 50, offset = 0) {
	return db
		.select()
		.from(affiliatePayoutTable)
		.where(eq(affiliatePayoutTable.affiliateId, affiliateId))
		.orderBy(desc(affiliatePayoutTable.cohortMonth))
		.limit(limit)
		.offset(offset);
}

/**
 * Dashboard headline numbers. Bot clicks are excluded from the click count —
 * they are stored, just never presented as real traffic.
 */
export async function getAffiliateSummary(affiliateId: string) {
	const [clicks] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(affiliateReferralClickTable)
		.where(
			and(
				eq(affiliateReferralClickTable.affiliateId, affiliateId),
				eq(affiliateReferralClickTable.isBot, false)
			)
		);

	const referralRows = await db
		.select({
			status: affiliateReferralTable.status,
			count: sql<number>`count(*)::int`
		})
		.from(affiliateReferralTable)
		.where(eq(affiliateReferralTable.affiliateId, affiliateId))
		.groupBy(affiliateReferralTable.status);

	const ledgerRows = await db
		.select({
			status: affiliateCommissionEventTable.status,
			total: sql<string>`coalesce(sum(${affiliateCommissionEventTable.commissionAmount}), 0)::text`
		})
		.from(affiliateCommissionEventTable)
		.where(eq(affiliateCommissionEventTable.affiliateId, affiliateId))
		.groupBy(affiliateCommissionEventTable.status);

	const byStatus = (rows: Array<{ status: string; total: string }>, status: string) =>
		rows.find((r) => r.status === status)?.total ?? '0';

	return {
		clicks: clicks?.count ?? 0,
		referrals: {
			qualified: referralRows.find((r) => r.status === 'QUALIFIED')?.count ?? 0,
			pending: referralRows.find((r) => r.status === 'PENDING')?.count ?? 0,
			rejected: referralRows.find((r) => r.status === 'REJECTED')?.count ?? 0
		},
		earnings: {
			pending: byStatus(ledgerRows, 'PENDING'),
			approved: byStatus(ledgerRows, 'APPROVED'),
			paid: byStatus(ledgerRows, 'PAID'),
			reversed: byStatus(ledgerRows, 'REVERSED')
		}
	};
}
