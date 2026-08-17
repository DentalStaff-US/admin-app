import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	massCampaignTable,
	massCampaignRecipientTable
} from '$lib/server/database/schemas/campaign';
import { createCampaignWithRecipients } from '$lib/server/database/queries/campaigns';
import { logger } from '$lib/server/logger';

export type AutoCampaignRecipient = {
	userId: string;
	/** candidate_profiles.id / client_profiles.id — stamps last_contacted_at. */
	profileId: string | null;
	email: string;
	firstName: string | null;
	lastName: string | null;
};

/**
 * Stable identifiers for each automated lifecycle campaign. Stored in
 * `mass_campaigns.filters.autoKey` and used to look up send history for
 * suppression, so these strings must not change casually.
 */
export const AUTO_CAMPAIGN_KEYS = {
	documentsMissing: 'auto:documents-missing',
	onboardingStalled: 'auto:onboarding-stalled',
	pendingApprovalTouchpoint: 'auto:pending-approval-touchpoint'
} as const;

export type AutoCampaignKey = (typeof AUTO_CAMPAIGN_KEYS)[keyof typeof AUTO_CAMPAIGN_KEYS];

/**
 * Enqueue a system-generated campaign. Returns immediately after writing rows —
 * the existing every-minute `processCampaignQueue` cron does the actual sending,
 * which is what gives these automated nudges the same batching, throttling,
 * per-recipient delivery tracking and unsubscribe footer as an admin blast.
 *
 * Suppression: anyone who was already SENT this same `key` within
 * `suppressWithinDays` is dropped. Derived from campaign history rather than a
 * "last nudged" column on the profile, so no schema churn and the suppression
 * window can be retuned per job without a migration.
 *
 * Returns counts rather than throwing — callers are cron jobs that should log
 * and carry on.
 */
export async function enqueueAutoCampaign(opts: {
	key: AutoCampaignKey;
	name: string;
	subject: string;
	/** Supports {{firstName}} / {{lastName}} tokens, same as admin campaigns. */
	body: string;
	audience: 'CANDIDATE' | 'CLIENT';
	recipients: AutoCampaignRecipient[];
	suppressWithinDays: number;
}): Promise<{ campaignId: string | null; queued: number; suppressed: number }> {
	const { key, name, subject, body, audience, recipients, suppressWithinDays } = opts;

	if (recipients.length === 0) {
		return { campaignId: null, queued: 0, suppressed: 0 };
	}

	const since = new Date(Date.now() - suppressWithinDays * 24 * 60 * 60 * 1000);
	const userIds = recipients.map((r) => r.userId);

	// Who already received this campaign type inside the suppression window?
	const recentlySent = await db
		.select({ userId: massCampaignRecipientTable.userId })
		.from(massCampaignRecipientTable)
		.innerJoin(massCampaignTable, eq(massCampaignRecipientTable.campaignId, massCampaignTable.id))
		.where(
			and(
				sql`${massCampaignTable.filters}->>'autoKey' = ${key}`,
				eq(massCampaignRecipientTable.status, 'SENT'),
				gte(massCampaignRecipientTable.sentAt, since),
				inArray(massCampaignRecipientTable.userId, userIds)
			)
		);

	const suppressedIds = new Set(recentlySent.map((r) => r.userId));
	const eligible = recipients.filter((r) => !suppressedIds.has(r.userId));

	if (eligible.length === 0) {
		return { campaignId: null, queued: 0, suppressed: suppressedIds.size };
	}

	// Reuse the admin path's writer: it chunks the recipient insert and wraps the
	// whole thing in a transaction, so a large nudge audience can't blow the
	// Postgres parameter cap or leave a campaign with no recipients.
	const { campaignId, recipientCount } = await createCampaignWithRecipients({
		name,
		channel: 'EMAIL',
		audience,
		filters: { autoKey: key, automated: true, suppressWithinDays } as never,
		subject,
		body,
		createdBy: null,
		recipients: eligible.map((r) => ({
			userId: r.userId,
			profileId: r.profileId,
			firstName: r.firstName,
			lastName: r.lastName,
			email: r.email,
			phone: null
		}))
	});

	logger.info?.('enqueueAutoCampaign queued', {
		key,
		campaignId,
		queued: recipientCount,
		suppressed: suppressedIds.size
	});

	return { campaignId, queued: recipientCount, suppressed: suppressedIds.size };
}
