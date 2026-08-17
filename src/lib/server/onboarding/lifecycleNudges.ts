import { and, eq, lt, not, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { CANDIDATE_STATUS, USER_ROLES } from '$lib/config/constants';
import {
	AUTO_CAMPAIGN_KEYS,
	enqueueAutoCampaign,
	type AutoCampaignRecipient
} from '$lib/server/campaigns/autoCampaign';
import { candidateHasOptionalDocsSql, candidateProfileCompleteSql } from './candidateCompleteness';
import { logger } from '$lib/server/logger';

/** Professionals stalled for this long count as abandoned onboarding. */
export const STALLED_ONBOARDING_DAYS = 7;

/**
 * Shared audience shape. `receive_email` is filtered here on purpose: opt-out is
 * enforced at audience-build time in this codebase (see `classifySegment` in
 * queries/campaigns.ts), NOT when the queue drains — so every audience query
 * must apply it itself or opted-out people get mailed.
 *
 * Blacklisted and unverified users are excluded too: neither should be chased.
 */
const baseCandidateConditions = [
	eq(userTable.role, USER_ROLES.CANDIDATE),
	eq(userTable.receiveEmail, true),
	sql`coalesce(${userTable.blacklisted}, false) = false`
];

function toRecipients(
	rows: Array<{
		userId: string;
		profileId: string;
		email: string;
		firstName: string | null;
		lastName: string | null;
	}>
): AutoCampaignRecipient[] {
	return rows.map((r) => ({
		userId: r.userId,
		profileId: r.profileId,
		email: r.email,
		firstName: r.firstName,
		lastName: r.lastName
	}));
}

const selectCandidate = {
	userId: userTable.id,
	profileId: candidateProfileTable.id,
	email: userTable.email,
	firstName: userTable.firstName,
	lastName: userTable.lastName
};

/**
 * Weekly: professionals whose profile is COMPLETE but who never uploaded any of
 * the optional documents (licenses, certifications). These people can work — the
 * nudge is about getting a fuller profile in front of practices, so the copy is
 * encouraging rather than blocking.
 */
export async function runDocumentsMissingNudge(): Promise<{
	queued: number;
	suppressed: number;
}> {
	const rows = await db
		.select(selectCandidate)
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.where(
			and(...baseCandidateConditions, candidateProfileCompleteSql, not(candidateHasOptionalDocsSql))
		);

	const result = await enqueueAutoCampaign({
		key: AUTO_CAMPAIGN_KEYS.documentsMissing,
		name: 'Automated — add your documents',
		subject: 'Add your licenses and certifications',
		body: [
			'Hi {{firstName}},',
			'',
			'Your profile is complete and visible to dental practices — nice work.',
			'',
			'One thing would make it stronger: you have not uploaded any licenses or',
			'certifications yet. Practices are more likely to book professionals whose',
			'credentials are already on file, and having them uploaded saves you from',
			'scrambling later.',
			'',
			'You can add them any time from Settings → Documents.',
			'',
			'— Dental Temps Staffing Solutions'
		].join('\n'),
		audience: 'CANDIDATE',
		recipients: toRecipients(rows),
		// Weekly cadence; suppress for 6 days so a single run per week lands and a
		// re-run (or a retimed cron) doesn't double-send.
		suppressWithinDays: 6
	});

	logger.info?.('runDocumentsMissingNudge', { matched: rows.length, ...result });
	return { queued: result.queued, suppressed: result.suppressed };
}

/**
 * Professionals who started onboarding but stalled: profile INCOMPLETE and
 * untouched for STALLED_ONBOARDING_DAYS. This is the claw-back audience.
 *
 * Uses `candidate_profiles.updated_at` as the progress clock — every onboarding
 * write touches the profile row, so it moves whenever they make progress.
 */
export async function runStalledOnboardingNudge(): Promise<{
	queued: number;
	suppressed: number;
	matched: number;
}> {
	const cutoff = new Date(Date.now() - STALLED_ONBOARDING_DAYS * 24 * 60 * 60 * 1000);

	const rows = await db
		.select(selectCandidate)
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.where(
			and(
				...baseCandidateConditions,
				not(candidateProfileCompleteSql),
				lt(candidateProfileTable.updatedAt, cutoff),
				// Don't chase people who were rejected or switched off.
				sql`${candidateProfileTable.status} IN ('PENDING', 'ACTIVE')`
			)
		);

	const result = await enqueueAutoCampaign({
		key: AUTO_CAMPAIGN_KEYS.onboardingStalled,
		name: 'Automated — finish your profile',
		subject: 'Finish your profile to start picking up shifts',
		body: [
			'Hi {{firstName}},',
			'',
			'You started setting up your profile with us but have not finished yet.',
			'Until it is complete we cannot match you with shifts at nearby practices.',
			'',
			'It usually takes just a few minutes to finish — sign in and pick up where',
			'you left off.',
			'',
			'If you have run into a problem or changed your mind, just reply to this',
			'email and let us know.',
			'',
			'— Dental Temps Staffing Solutions'
		].join('\n'),
		audience: 'CANDIDATE',
		recipients: toRecipients(rows),
		// Runs daily but only chases a given person every 14 days, so a long-stalled
		// signup gets a couple of reminders rather than a daily drip.
		suppressWithinDays: 14
	});

	logger.info?.('runStalledOnboardingNudge', { matched: rows.length, ...result });
	return { queued: result.queued, suppressed: result.suppressed, matched: rows.length };
}

/**
 * Monthly touchpoint for professionals sitting at PENDING: tells them what is
 * still missing (if anything) so approval can move forward.
 *
 * Split into two audiences so the copy is honest: someone whose profile is
 * complete is genuinely just waiting on us, and should not be told to go finish
 * something.
 */
export async function runPendingApprovalTouchpoint(): Promise<{
	queued: number;
	suppressed: number;
}> {
	const rows = await db
		.select({ ...selectCandidate, complete: candidateProfileCompleteSql.as('complete') })
		.from(candidateProfileTable)
		.innerJoin(userTable, eq(candidateProfileTable.userId, userTable.id))
		.where(
			and(...baseCandidateConditions, eq(candidateProfileTable.status, CANDIDATE_STATUS.PENDING))
		);

	const waitingOnUs = rows.filter((r) => r.complete);
	const waitingOnThem = rows.filter((r) => !r.complete);

	let queued = 0;
	let suppressed = 0;

	if (waitingOnUs.length > 0) {
		const r = await enqueueAutoCampaign({
			key: AUTO_CAMPAIGN_KEYS.pendingApprovalTouchpoint,
			name: 'Automated — pending approval (complete profiles)',
			subject: 'Your profile is with our team for approval',
			body: [
				'Hi {{firstName}},',
				'',
				'Your profile is complete and is with our team for approval. There is',
				'nothing you need to do right now.',
				'',
				'If anything has changed — your availability, licenses, or contact',
				'details — you can update it from your settings at any time.',
				'',
				'— Dental Temps Staffing Solutions'
			].join('\n'),
			audience: 'CANDIDATE',
			recipients: toRecipients(waitingOnUs),
			suppressWithinDays: 27
		});
		queued += r.queued;
		suppressed += r.suppressed;
	}

	if (waitingOnThem.length > 0) {
		const r = await enqueueAutoCampaign({
			key: AUTO_CAMPAIGN_KEYS.pendingApprovalTouchpoint,
			name: 'Automated — pending approval (incomplete profiles)',
			subject: 'A few things left before we can approve you',
			body: [
				'Hi {{firstName}},',
				'',
				'Your account is still pending approval because your profile is not',
				'quite finished. Once it is complete our team can review and approve',
				'you, and you can start picking up shifts.',
				'',
				'Sign in to see what is left — it is usually only a couple of items.',
				'',
				'— Dental Temps Staffing Solutions'
			].join('\n'),
			audience: 'CANDIDATE',
			recipients: toRecipients(waitingOnThem),
			suppressWithinDays: 27
		});
		queued += r.queued;
		suppressed += r.suppressed;
	}

	logger.info?.('runPendingApprovalTouchpoint', {
		matched: rows.length,
		complete: waitingOnUs.length,
		incomplete: waitingOnThem.length,
		queued,
		suppressed
	});

	return { queued, suppressed };
}
