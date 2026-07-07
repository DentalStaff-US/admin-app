import db from '$lib/server/database/drizzle';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
	massCampaignTable,
	massCampaignRecipientTable,
	type MassCampaign,
	type MassCampaignRecipient
} from '$lib/server/database/schemas/campaign';
import { candidateProfileTable } from '$lib/server/database/schemas/candidate';
import { clientProfileTable } from '$lib/server/database/schemas/client';
import { EmailService } from '$lib/server/email/emailService';
import { sms } from '$lib/server/sms/smsService';
import { logger } from '$lib/server/logger';
import { renderTokens, textToHtml } from './render';
import { unsubscribeUrl } from './unsubscribe';

// Recipients processed per tick. Doubles as the Resend batch size — kept at 100
// (Resend's per-request cap; trivially lowered here if this account is capped
// lower). The minute cron + this bound keeps each invocation short and resumable.
export const CAMPAIGN_BATCH_SIZE = 100;

// Light per-message throttle for SMS so a large blast doesn't hammer Twilio.
const SMS_THROTTLE_MS = 120;

const emailService = new EmailService();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function emailFooterHtml(userId: string): string {
	const url = unsubscribeUrl(userId);
	return `<hr><p style="font-size:12px;color:#888">You're receiving this because you have an account with us. <a href="${url}">Unsubscribe</a> from these messages.</p>`;
}

function emailFooterText(userId: string): string {
	return `\n\n—\nYou're receiving this because you have an account with us. Unsubscribe: ${unsubscribeUrl(userId)}`;
}

function smsBody(body: string): string {
	// Append a STOP notice unless the admin already included one. Twilio's
	// Messaging Service also honors STOP at the carrier level; this keeps the
	// human-visible opt-out explicit.
	return /\bstop\b/i.test(body) ? body : `${body}\n\nReply STOP to opt out.`;
}

type Outcome = {
	id: string;
	profileId: string | null;
	status: 'SENT' | 'FAILED';
	providerMessageId?: string;
	error?: string;
};

/**
 * Drain one bounded batch of the campaign queue. Intended to be called once per
 * cron tick behind an advisory lock (see the /jobs/campaigns/processQueue
 * endpoint) so ticks never overlap. Returns `{ noop: true }` when there's
 * nothing to do.
 *
 * Flow: claim the oldest QUEUED/SENDING campaign → flip QUEUED→SENDING → send
 * the next batch of PENDING recipients → record per-recipient outcomes, bump
 * counters, stamp last_contacted_at on successful sends → mark COMPLETED once no
 * PENDING remain.
 */
export async function processCampaignQueue(): Promise<Record<string, unknown>> {
	const [campaign] = (await db
		.select()
		.from(massCampaignTable)
		.where(inArray(massCampaignTable.status, ['QUEUED', 'SENDING']))
		.orderBy(asc(massCampaignTable.createdAt))
		.limit(1)) as MassCampaign[];

	if (!campaign) return { noop: true };

	if (campaign.status === 'QUEUED') {
		await db
			.update(massCampaignTable)
			.set({ status: 'SENDING', startedAt: new Date(), updatedAt: new Date() })
			.where(eq(massCampaignTable.id, campaign.id));
	}

	const pending = (await db
		.select()
		.from(massCampaignRecipientTable)
		.where(
			and(
				eq(massCampaignRecipientTable.campaignId, campaign.id),
				eq(massCampaignRecipientTable.status, 'PENDING')
			)
		)
		.orderBy(asc(massCampaignRecipientTable.createdAt))
		.limit(CAMPAIGN_BATCH_SIZE)) as MassCampaignRecipient[];

	if (pending.length === 0) {
		await markCompletedIfActive(campaign.id);
		return { campaignId: campaign.id, completed: true };
	}

	const outcomes: Outcome[] = [];
	let sent = 0;
	let failed = 0;

	if (campaign.channel === 'EMAIL') {
		const emails = pending.map((r) => {
			const body = renderTokens(campaign.body, r);
			return {
				to: [{ email: r.toAddress }],
				subject: campaign.subject || '',
				html: `${textToHtml(body)}${emailFooterHtml(r.userId)}`,
				text: `${body}${emailFooterText(r.userId)}`
			};
		});

		const result = await emailService.sendBulkEmail({ emails });
		result.results.forEach((res, i) => {
			const r = pending[i];
			if (res.success) {
				sent++;
				outcomes.push({
					id: r.id,
					profileId: r.profileId,
					status: 'SENT',
					providerMessageId: res.id
				});
			} else {
				failed++;
				outcomes.push({ id: r.id, profileId: r.profileId, status: 'FAILED', error: res.error });
			}
		});
	} else {
		for (const r of pending) {
			const res = await sms.send({
				to: r.toAddress,
				body: smsBody(renderTokens(campaign.body, r))
			});
			if (res.success) {
				sent++;
				outcomes.push({
					id: r.id,
					profileId: r.profileId,
					status: 'SENT',
					providerMessageId: res.sid
				});
			} else {
				failed++;
				outcomes.push({ id: r.id, profileId: r.profileId, status: 'FAILED', error: res.error });
			}
			await delay(SMS_THROTTLE_MS);
		}
	}

	await persistOutcomes(campaign, outcomes, sent, failed);

	const remaining = await countPending(campaign.id);
	if (remaining === 0) await markCompletedIfActive(campaign.id);

	logger.info('processCampaignQueue batch', {
		campaignId: campaign.id,
		channel: campaign.channel,
		sent,
		failed,
		remaining
	});

	return { campaignId: campaign.id, sent, failed, remaining, noop: sent === 0 && failed === 0 };
}

async function persistOutcomes(
	campaign: MassCampaign,
	outcomes: Outcome[],
	sent: number,
	failed: number
): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		for (const o of outcomes) {
			await tx
				.update(massCampaignRecipientTable)
				.set({
					status: o.status,
					providerMessageId: o.providerMessageId ?? null,
					error: o.error ?? null,
					sentAt: o.status === 'SENT' ? now : null
				})
				.where(eq(massCampaignRecipientTable.id, o.id));
		}

		await tx
			.update(massCampaignTable)
			.set({
				sentCount: sql`${massCampaignTable.sentCount} + ${sent}`,
				failedCount: sql`${massCampaignTable.failedCount} + ${failed}`,
				updatedAt: now
			})
			.where(eq(massCampaignTable.id, campaign.id));

		// Stamp last_contacted_at on the reached profiles (drives the "stale" filter).
		const contactedProfileIds = outcomes
			.filter((o) => o.status === 'SENT' && o.profileId)
			.map((o) => o.profileId as string);
		if (contactedProfileIds.length) {
			if (campaign.audience === 'CANDIDATE') {
				await tx
					.update(candidateProfileTable)
					.set({ lastContactedAt: now })
					.where(inArray(candidateProfileTable.id, contactedProfileIds));
			} else {
				await tx
					.update(clientProfileTable)
					.set({ lastContactedAt: now })
					.where(inArray(clientProfileTable.id, contactedProfileIds));
			}
		}
	});
}

async function countPending(campaignId: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(massCampaignRecipientTable)
		.where(
			and(
				eq(massCampaignRecipientTable.campaignId, campaignId),
				eq(massCampaignRecipientTable.status, 'PENDING')
			)
		);
	return Number(row?.n ?? 0);
}

// Only complete a campaign that's still active — guards against a concurrent
// cancel (which sets CANCELLED) being clobbered back to COMPLETED.
async function markCompletedIfActive(campaignId: string): Promise<void> {
	await db
		.update(massCampaignTable)
		.set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(massCampaignTable.id, campaignId),
				inArray(massCampaignTable.status, ['QUEUED', 'SENDING'])
			)
		);
}
