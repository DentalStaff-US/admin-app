/**
 * Nightly affiliate eligibility reconciliation.
 *
 * This is NOT belt-and-braces. Client and candidate statuses get edited directly
 * in the DB during support work and by import scripts, where no application hook
 * can observe the change — so without a sweep an affiliate could keep a live
 * referral link (and keep accruing) after their account was deactivated.
 *
 * Re-derives every internal affiliate's status from its underlying profile.
 * External partners are skipped: they have no internal status to derive from.
 */
import { eq, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import { userTable } from '$lib/server/database/schemas/auth';
import { clientProfileTable, clientStaffProfileTable } from '$lib/server/database/schemas/client';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import {
	decideEligibility,
	isInternalAffiliateRole,
	type AffiliateStatus,
	type InternalProfileStatus
} from '$lib/server/affiliate/eligibility';
import { logger } from '$lib/server/logger';
import { USER_ROLES } from '$lib/config/constants';

export type ReconcileResult = {
	scanned: number;
	changed: number;
	held: number;
	reactivated: number;
};

export async function reconcileAffiliateEligibility(): Promise<ReconcileResult> {
	// One pass over affiliates joined to their user, then two bulk status lookups —
	// rather than N+1 per affiliate.
	const affiliates = await db
		.select({
			id: affiliateProfileTable.id,
			userId: affiliateProfileTable.userId,
			status: affiliateProfileTable.status,
			statusSetManually: affiliateProfileTable.statusSetManually,
			role: userTable.role
		})
		.from(affiliateProfileTable)
		.innerJoin(userTable, eq(affiliateProfileTable.userId, userTable.id));

	const internal = affiliates.filter((a) => isInternalAffiliateRole(a.role));
	if (internal.length === 0) {
		return { scanned: affiliates.length, changed: 0, held: 0, reactivated: 0 };
	}

	const candidateUserIds = internal
		.filter((a) => a.role === USER_ROLES.CANDIDATE)
		.map((a) => a.userId);
	const clientUserIds = internal
		.filter((a) => a.role !== USER_ROLES.CANDIDATE)
		.map((a) => a.userId);

	const statusByUserId = new Map<string, InternalProfileStatus>();

	if (candidateUserIds.length > 0) {
		const rows = await db
			.select({ userId: candidateProfileTable.userId, status: candidateProfileTable.status })
			.from(candidateProfileTable)
			.where(inArray(candidateProfileTable.userId, candidateUserIds));
		for (const r of rows) {
			if (r.status) statusByUserId.set(r.userId, r.status as InternalProfileStatus);
		}
	}

	if (clientUserIds.length > 0) {
		// Account owners: their own client_profiles row.
		const owners = await db
			.select({ userId: clientProfileTable.userId, status: clientProfileTable.status })
			.from(clientProfileTable)
			.where(inArray(clientProfileTable.userId, clientUserIds));
		for (const r of owners) {
			if (r.status) statusByUserId.set(r.userId, r.status as InternalProfileStatus);
		}

		// CLIENT_STAFF have no client_profiles row of their own — they inherit
		// their employer's status via client_staff.client_id.
		const staff = await db
			.select({
				userId: clientStaffProfileTable.userId,
				status: clientProfileTable.status
			})
			.from(clientStaffProfileTable)
			.innerJoin(clientProfileTable, eq(clientStaffProfileTable.clientId, clientProfileTable.id))
			.where(inArray(clientStaffProfileTable.userId, clientUserIds));
		for (const r of staff) {
			if (r.status && !statusByUserId.has(r.userId)) {
				statusByUserId.set(r.userId, r.status as InternalProfileStatus);
			}
		}
	}

	let changed = 0;
	let held = 0;
	let reactivated = 0;

	for (const affiliate of internal) {
		const decision = decideEligibility({
			role: affiliate.role,
			profileStatus: statusByUserId.get(affiliate.userId) ?? null,
			currentStatus: affiliate.status as AffiliateStatus,
			statusSetManually: affiliate.statusSetManually
		});

		if (!decision.changed) continue;

		await db
			.update(affiliateProfileTable)
			.set({
				status: decision.status,
				statusReason: decision.reason,
				updatedAt: new Date()
			})
			.where(eq(affiliateProfileTable.id, affiliate.id));

		changed++;
		if (decision.status === 'ON_HOLD') held++;
		if (decision.status === 'ACTIVE') reactivated++;

		logger.info('affiliate eligibility reconciled', {
			affiliateId: affiliate.id,
			from: affiliate.status,
			to: decision.status,
			reason: decision.reason
		});
	}

	return { scanned: affiliates.length, changed, held, reactivated };
}
