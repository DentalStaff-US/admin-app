/**
 * Affiliate enrolment and profile reads.
 *
 * Split out of queries/affiliates.ts specifically so it stays free of `logger`
 * (which imports $app/environment) and therefore importable from tsx-run
 * scripts under db-scripts/. Keep it that way: no $app, no $env imports here,
 * directly or transitively.
 */
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import db from '$lib/server/database/drizzle';
import {
	affiliateProfileTable,
	affiliateReferralCodeTable,
	type AffiliateProfile
} from '$lib/server/database/schemas/affiliate';
import { userTable } from '$lib/server/database/schemas/auth';
import { clientProfileTable, clientStaffProfileTable } from '$lib/server/database/schemas/client';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { normalizeCode, generateUniqueCode, cryptoRandomInt } from '$lib/server/affiliate/code';
import {
	isInternalAffiliateRole,
	type AffiliateStatus,
	type InternalProfileStatus
} from '$lib/server/affiliate/eligibility';

export async function getAffiliateByUserId(userId: string): Promise<AffiliateProfile | null> {
	const [row] = await db
		.select()
		.from(affiliateProfileTable)
		.where(eq(affiliateProfileTable.userId, userId))
		.limit(1);
	return row ?? null;
}

export async function getPrimaryCode(affiliateId: string) {
	const [row] = await db
		.select()
		.from(affiliateReferralCodeTable)
		.where(
			and(
				eq(affiliateReferralCodeTable.affiliateId, affiliateId),
				eq(affiliateReferralCodeTable.isPrimary, true)
			)
		)
		.limit(1);
	return row ?? null;
}

/** The client/candidate profile status an internal affiliate derives from. */
export async function getInternalProfileStatus(
	userId: string,
	role: string | null
): Promise<InternalProfileStatus | null> {
	if (!isInternalAffiliateRole(role)) return null;

	if (role === 'CANDIDATE') {
		const [row] = await db
			.select({ status: candidateProfileTable.status })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, userId))
			.limit(1);
		return (row?.status as InternalProfileStatus) ?? null;
	}

	// CLIENT_STAFF do NOT own a client_profiles row — they link to their
	// employer's through client_staff.client_id. Looking them up by user_id would
	// always miss, silently making every staff member ineligible.
	if (role === 'CLIENT_STAFF') {
		const [row] = await db
			.select({ status: clientProfileTable.status })
			.from(clientStaffProfileTable)
			.innerJoin(clientProfileTable, eq(clientStaffProfileTable.clientId, clientProfileTable.id))
			.where(eq(clientStaffProfileTable.userId, userId))
			.limit(1);
		return (row?.status as InternalProfileStatus) ?? null;
	}

	const [row] = await db
		.select({ status: clientProfileTable.status })
		.from(clientProfileTable)
		.where(eq(clientProfileTable.userId, userId))
		.limit(1);
	return (row?.status as InternalProfileStatus) ?? null;
}

/** Mint and store the affiliate's one permanent primary code. */
export async function issuePrimaryCode(affiliateId: string): Promise<string> {
	const code = await generateUniqueCode(cryptoRandomInt, async (normalized) => {
		const [hit] = await db
			.select({ id: affiliateReferralCodeTable.id })
			.from(affiliateReferralCodeTable)
			.where(eq(affiliateReferralCodeTable.codeNormalized, normalized))
			.limit(1);
		return !!hit;
	});

	await db.insert(affiliateReferralCodeTable).values({
		id: nanoid(),
		affiliateId,
		code,
		codeNormalized: normalizeCode(code),
		isPrimary: true,
		active: true
	});

	return code;
}

/**
 * Idempotently give a user an affiliate profile and a permanent primary code.
 *
 * Safe to call repeatedly — the backfill script, the portal's first load and the
 * external-partner application flow all funnel through here.
 *
 * The initial status is DERIVED, not assumed: an internal user whose profile is
 * not ACTIVE enrols straight to ON_HOLD and never receives a working link.
 */
export async function ensureAffiliateProfile(
	userId: string,
	opts: { displayName?: string | null; contactEmail?: string | null } = {}
): Promise<{ profile: AffiliateProfile; code: string; created: boolean }> {
	const existing = await getAffiliateByUserId(userId);
	if (existing) {
		const code = await getPrimaryCode(existing.id);
		if (code) return { profile: existing, code: code.code, created: false };
		// Profile without a code — a half-finished enrol. Repair it.
		return { profile: existing, code: await issuePrimaryCode(existing.id), created: false };
	}

	const [user] = await db
		.select({ id: userTable.id, role: userTable.role, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);
	if (!user) throw new Error(`Cannot enroll affiliate: user ${userId} not found`);

	const profileStatus = await getInternalProfileStatus(userId, user.role);
	const initialStatus: AffiliateStatus = isInternalAffiliateRole(user.role)
		? profileStatus === 'ACTIVE'
			? 'ACTIVE'
			: 'ON_HOLD'
		: 'PENDING'; // external partners await admin approval

	const [profile] = await db
		.insert(affiliateProfileTable)
		.values({
			id: nanoid(),
			userId,
			status: initialStatus,
			statusReason: isInternalAffiliateRole(user.role)
				? `PROFILE_STATUS:${profileStatus ?? 'MISSING'}`
				: 'AWAITING_APPROVAL',
			displayName: opts.displayName ?? null,
			contactEmail: opts.contactEmail ?? user.email
		})
		.onConflictDoNothing({ target: affiliateProfileTable.userId })
		.returning();

	// Lost a race with a concurrent enrol — take the winner's row.
	if (!profile) {
		const winner = await getAffiliateByUserId(userId);
		if (!winner) throw new Error(`Failed to enroll affiliate for user ${userId}`);
		const code = await getPrimaryCode(winner.id);
		return {
			profile: winner,
			code: code?.code ?? (await issuePrimaryCode(winner.id)),
			created: false
		};
	}

	return { profile, code: await issuePrimaryCode(profile.id), created: true };
}
