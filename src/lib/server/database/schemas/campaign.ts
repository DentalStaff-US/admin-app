import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer, index } from 'drizzle-orm/pg-core';
import { userTable } from './auth';

// Channel the mass notification is delivered over. Either channel can target
// either audience (SMS is the default for candidates, email for clients), but
// the choice is fixed per send.
export const massCampaignChannelEnum = pgEnum('mass_campaign_channel', ['SMS', 'EMAIL']);

// Role-first audience. This is the top-level segment filter — every other
// criterion is scoped within the chosen audience.
export const massCampaignAudienceEnum = pgEnum('mass_campaign_audience', ['CANDIDATE', 'CLIENT']);

// Lifecycle:
//   DRAFT      – created but not yet handed to the send queue (unused for MVP;
//                the builder queues immediately, but kept for future scheduling)
//   QUEUED     – recipients snapshotted, waiting for the cron to pick it up
//   SENDING    – cron is draining PENDING recipients in batches
//   COMPLETED  – no PENDING recipients remain
//   CANCELLED  – admin stopped it; remaining PENDING recipients are skipped
//   FAILED     – unrecoverable error while processing
export const massCampaignStatusEnum = pgEnum('mass_campaign_status', [
	'DRAFT',
	'QUEUED',
	'SENDING',
	'COMPLETED',
	'CANCELLED',
	'FAILED'
]);

// Per-recipient delivery state within a campaign.
export const massCampaignRecipientStatusEnum = pgEnum('mass_campaign_recipient_status', [
	'PENDING',
	'SENT',
	'FAILED',
	'SKIPPED'
]);

export const massCampaignTable = pgTable('mass_campaigns', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	channel: massCampaignChannelEnum('channel').notNull(),
	audience: massCampaignAudienceEnum('audience').notNull(),
	status: massCampaignStatusEnum('status').notNull().default('DRAFT'),
	// Snapshot of the segment criteria used to build the recipient list — kept
	// for audit / reproducibility. Not re-queried at send time.
	filters: jsonb('filters').notNull().default({}),
	// Email only.
	subject: text('subject'),
	// Message body with {{firstName}} / {{lastName}} tokens.
	body: text('body').notNull(),
	recipientCount: integer('recipient_count').notNull().default(0),
	sentCount: integer('sent_count').notNull().default(0),
	failedCount: integer('failed_count').notNull().default(0),
	createdBy: text('created_by')
		.notNull()
		.references(() => userTable.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true })
});

export const massCampaignRecipientTable = pgTable(
	'mass_campaign_recipients',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		campaignId: uuid('campaign_id')
			.notNull()
			.references(() => massCampaignTable.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => userTable.id, { onDelete: 'cascade' }),
		// candidate_profiles.id or client_profiles.id — used to stamp
		// last_contacted_at once the message is sent.
		profileId: text('profile_id'),
		// E.164 phone (SMS) or email address (EMAIL), snapshotted at queue time so
		// the row is self-contained even if the user later edits their contact info.
		toAddress: text('to_address').notNull(),
		firstName: text('first_name'),
		lastName: text('last_name'),
		status: massCampaignRecipientStatusEnum('status').notNull().default('PENDING'),
		// Twilio message SID or Resend email id.
		providerMessageId: text('provider_message_id'),
		error: text('error'),
		sentAt: timestamp('sent_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		// The drain query filters by (campaignId, status='PENDING') every tick.
		campaignStatusIdx: index('mass_campaign_recipients_campaign_status_idx').on(
			t.campaignId,
			t.status
		)
	})
);

export type MassCampaign = typeof massCampaignTable.$inferSelect;
export type NewMassCampaign = typeof massCampaignTable.$inferInsert;
export type UpdateMassCampaign = Partial<typeof massCampaignTable.$inferInsert>;
export type MassCampaignRecipient = typeof massCampaignRecipientTable.$inferSelect;
export type NewMassCampaignRecipient = typeof massCampaignRecipientTable.$inferInsert;

export type MassCampaignChannel = (typeof massCampaignChannelEnum.enumValues)[number];
export type MassCampaignAudience = (typeof massCampaignAudienceEnum.enumValues)[number];
export type MassCampaignStatus = (typeof massCampaignStatusEnum.enumValues)[number];
