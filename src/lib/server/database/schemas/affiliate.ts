/**
 * Affiliate Network schema.
 *
 * Model summary:
 *  - `affiliate_profiles` is ROLE-ORTHOGONAL: any users row may have exactly one.
 *    Affiliate "type" is not stored here — it is simply `users.role`
 *    (CLIENT / CLIENT_STAFF = practice, CANDIDATE = professional,
 *    EXTERNAL_PARTNER = external partner).
 *  - Eligibility for internal affiliates is DERIVED from the underlying
 *    client_profiles.status / candidate_profiles.status. External partners have
 *    no internal status and are governed only by `status` here.
 *  - The ledger is APPEND-ONLY. Corrections are new rows (adjustments /
 *    reversals), never edits or deletes.
 *
 * Money convention: numeric(12,2) DOLLARS, matching `invoices`. Commission is
 * computed in integer cents inside the pure functions in src/lib/server/affiliate/
 * and rounded ROUND_HALF_UP exactly once, at event creation.
 *
 * ⚠️ MIGRATION PREREQUISITE — run BEFORE the first push of this file:
 *      CREATE SEQUENCE IF NOT EXISTS affiliate_pid_seq;
 *    Drizzle's sql`nextval(...)` default does not create the sequence (same trap
 *    as candidate_profiles.puid / puid_seq).
 */
import {
	pgTable,
	text,
	timestamp,
	boolean,
	pgEnum,
	decimal,
	integer,
	bigserial,
	date,
	uuid,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userTable } from './auth';
import { invoiceTable, timeSheetTable } from './requisition';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * PENDING   — enrolled but not yet usable (external partners awaiting approval).
 * ACTIVE    — link works, commission accrues.
 * ON_HOLD   — no link, NO NEW ACCRUAL, but any balance already earned still pays
 *             out on its normal schedule. This is what an internal affiliate is
 *             set to when their client/candidate profile leaves ACTIVE.
 * DENIED    — terminal. No accrual, and the remaining balance is frozen pending
 *             manual admin resolution. Never auto-cleared by an eligibility sync.
 */
export const affiliateStatusEnum = pgEnum('affiliate_status', [
	'PENDING',
	'ACTIVE',
	'ON_HOLD',
	'DENIED'
]);

/** How a referral came to be attributed. */
export const affiliateAttributionSourceEnum = pgEnum('affiliate_attribution_source', [
	'COOKIE',
	'URL',
	'INVITE',
	'MANUAL',
	'SELF_REPORTED'
]);

export const affiliateReferralStatusEnum = pgEnum('affiliate_referral_status', [
	'PENDING', // flagged by a fraud heuristic, awaiting admin review
	'QUALIFIED', // good; commission may accrue
	'REJECTED' // self-referral, superseded by an invite, or admin-rejected
]);

/**
 * What revenue event produced a ledger row. Phase 1 only ever writes
 * TEMP_SHIFT_INVOICE_PAID and MANUAL_ADJUSTMENT; the rest exist so placements
 * and subscriptions can be added later without a migration.
 */
export const affiliateCommissionSourceEnum = pgEnum('affiliate_commission_source', [
	'TEMP_SHIFT_INVOICE_PAID',
	'PERMANENT_PLACEMENT',
	'SUBSCRIPTION',
	'MANUAL_ADJUSTMENT'
]);

/**
 * PENDING  — accrued, inside its cohort/hold window.
 * APPROVED — cohort closed, eligible for the next payout run.
 * PAID     — included in a payout whose Stripe transfer succeeded.
 * REVERSED — the underlying invoice was refunded or voided before payout.
 */
export const affiliateCommissionStatusEnum = pgEnum('affiliate_commission_status', [
	'PENDING',
	'APPROVED',
	'PAID',
	'REVERSED'
]);

export const affiliatePayoutStatusEnum = pgEnum('affiliate_payout_status', [
	'PENDING',
	'PROCESSING',
	'PAID',
	'FAILED'
]);

/* -------------------------------------------------------------------------- */
/* affiliate_profiles                                                         */
/* -------------------------------------------------------------------------- */

export const affiliateProfileTable = pgTable(
	'affiliate_profiles',
	{
		id: text('id').notNull().primaryKey(),
		userId: text('user_id')
			.notNull()
			.unique()
			.references(() => userTable.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),

		// Short, human-quotable public id for support ("affiliate #1042").
		// Distinct from both the referral code and the uuid.
		// ⚠️ Requires `CREATE SEQUENCE affiliate_pid_seq;` — see file header.
		pid: integer('pid')
			.notNull()
			.unique()
			.default(sql`nextval('affiliate_pid_seq')`),

		status: affiliateStatusEnum('status').notNull().default('PENDING'),
		// Why the status is what it is — e.g. 'client_profile_status:INACTIVE' for a
		// derived hold, or free text for an admin action. Surfaced in the console.
		statusReason: text('status_reason'),
		// True when an admin set the status by hand. An eligibility sync will never
		// overwrite a manual DENIED; see src/lib/server/affiliate/eligibility.ts.
		statusSetManually: boolean('status_set_manually').notNull().default(false),

		// Contact / display. For external partners these are the only identity we have.
		displayName: text('display_name'),
		organizationName: text('organization_name'),
		website: text('website'),
		contactEmail: text('contact_email'),
		contactPhone: text('contact_phone'),

		// Per-affiliate negotiated rate. NULL = use admin_config.affiliate_commission_rate.
		// Percent, e.g. 2.50 = 2.5%. Forward-only: changing it never rewrites an
		// existing commission event, because each event snapshots its own rule.
		commissionRateOverride: decimal('commission_rate_override', { precision: 5, scale: 2 }),
		overrideReason: text('override_reason'),
		overrideSetBy: text('override_set_by').references(() => userTable.id, {
			onDelete: 'set null'
		}),
		overrideSetAt: timestamp('override_set_at', { withTimezone: true, mode: 'date' }),

		// Stripe Connect (Express). Null until the affiliate starts onboarding.
		// This is an `acct_…` id and is UNRELATED to users.stripe_customer_id,
		// which is a customer (`cus_…`) used for billing clients.
		stripeConnectAccountId: text('stripe_connect_account_id').unique(),
		connectChargesEnabled: boolean('connect_charges_enabled').notNull().default(false),
		connectPayoutsEnabled: boolean('connect_payouts_enabled').notNull().default(false),
		connectDetailsSubmitted: boolean('connect_details_submitted').notNull().default(false),
		// Raw `requirements.currently_due` from the last account.updated event, so the
		// portal can tell the affiliate exactly what Stripe still needs.
		connectRequirementsDue: text('connect_requirements_due').array(),
		connectUpdatedAt: timestamp('connect_updated_at', { withTimezone: true, mode: 'date' }),

		agreedToTermsAt: timestamp('agreed_to_terms_at', { withTimezone: true, mode: 'date' }),
		approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
		approvedBy: text('approved_by').references(() => userTable.id, { onDelete: 'set null' }),
		notes: text('notes'),

		// Phase 3: affiliate-recruits-affiliate. Designed now so the later feature is
		// purely additive; left NULL and unread in Phase 1.
		parentAffiliateId: text('parent_affiliate_id')
	},
	(table) => [
		index('affiliate_profiles_status_idx').on(table.status),
		index('affiliate_profiles_connect_acct_idx').on(table.stripeConnectAccountId)
	]
);

/* -------------------------------------------------------------------------- */
/* affiliate_referral_codes                                                   */
/* -------------------------------------------------------------------------- */

export const affiliateReferralCodeTable = pgTable(
	'affiliate_referral_codes',
	{
		id: text('id').notNull().primaryKey(),
		affiliateId: text('affiliate_id')
			.notNull()
			.references(() => affiliateProfileTable.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),

		// The code as displayed to humans (preserves casing for legibility).
		code: text('code').notNull(),
		// upper(trim(code)) — the uniqueness/lookup key, so DTSS-SMILE and dtss-smile
		// can never both exist. Cheaper and more portable than a citext column.
		codeNormalized: text('code_normalized').notNull().unique(),

		// Exactly one primary code per affiliate; it is permanent and never changes.
		isPrimary: boolean('is_primary').notNull().default(false),
		// Optional labelling for extra campaign codes (Phase 2).
		label: text('label'),
		campaign: text('campaign'),
		active: boolean('active').notNull().default(true)
	},
	(table) => [
		index('affiliate_referral_codes_affiliate_idx').on(table.affiliateId),
		// One and only one primary code per affiliate.
		uniqueIndex('affiliate_referral_codes_primary_uidx')
			.on(table.affiliateId)
			.where(sql`${table.isPrimary} = true`)
	]
);

/* -------------------------------------------------------------------------- */
/* affiliate_referral_clicks                                                  */
/* -------------------------------------------------------------------------- */

export const affiliateReferralClickTable = pgTable(
	'affiliate_referral_clicks',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		codeId: text('code_id').references(() => affiliateReferralCodeTable.id, {
			onDelete: 'set null'
		}),
		affiliateId: text('affiliate_id').references(() => affiliateProfileTable.id, {
			onDelete: 'cascade'
		}),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),

		// HMAC-SHA256 of the client IP with a server secret. NEVER store raw IPs —
		// this is only ever compared for dedupe and same-household fraud heuristics.
		ipHash: text('ip_hash'),
		userAgentHash: text('user_agent_hash'),
		userAgent: text('user_agent'),
		referer: text('referer'),
		landingHost: text('landing_host'),
		landingPath: text('landing_path'),
		utmSource: text('utm_source'),
		utmMedium: text('utm_medium'),
		utmCampaign: text('utm_campaign'),

		// Bots are FLAGGED, never dropped — an affiliate asking "why only 12 clicks
		// from 40k followers" needs us to be able to say "3,400 were link previews".
		isBot: boolean('is_bot').notNull().default(false),
		botReason: text('bot_reason')
	},
	(table) => [
		index('affiliate_referral_clicks_affiliate_idx').on(table.affiliateId, table.createdAt),
		index('affiliate_referral_clicks_code_idx').on(table.codeId, table.createdAt),
		// Backs the 30-minute dedupe window lookup.
		index('affiliate_referral_clicks_dedupe_idx').on(
			table.codeId,
			table.ipHash,
			table.userAgentHash,
			table.createdAt
		)
	]
);

/* -------------------------------------------------------------------------- */
/* affiliate_referrals                                                        */
/* -------------------------------------------------------------------------- */

export const affiliateReferralTable = pgTable(
	'affiliate_referrals',
	{
		id: text('id').notNull().primaryKey(),
		affiliateId: text('affiliate_id')
			.notNull()
			.references(() => affiliateProfileTable.id, { onDelete: 'cascade' }),
		codeId: text('code_id').references(() => affiliateReferralCodeTable.id, {
			onDelete: 'set null'
		}),

		// UNIQUE is the "a referral never changes" rule, enforced by the database
		// rather than by application discipline. It also makes the attribution write
		// naturally idempotent (ON CONFLICT DO NOTHING), which matters because the
		// candidate-app path is an HTTP call that can be retried.
		referredUserId: text('referred_user_id')
			.notNull()
			.unique()
			.references(() => userTable.id, { onDelete: 'cascade' }),

		// Snapshot of the referred user's role AT SIGNUP. A professional may later
		// open a practice; freezing this keeps the ledger reproducible.
		referredRole: text('referred_role').notNull(),

		attributionSource: affiliateAttributionSourceEnum('attribution_source').notNull(),
		clickId: integer('click_id'),
		status: affiliateReferralStatusEnum('status').notNull().default('QUALIFIED'),
		rejectedReason: text('rejected_reason'),
		// Set when a fraud heuristic fired. Statistical signals go to a human queue;
		// only identity equality (same user, same email) hard-rejects.
		flaggedReason: text('flagged_reason'),

		firstTouchAt: timestamp('first_touch_at', { withTimezone: true, mode: 'date' }),
		signedUpAt: timestamp('signed_up_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('affiliate_referrals_affiliate_idx').on(table.affiliateId),
		index('affiliate_referrals_status_idx').on(table.status)
	]
);

/* -------------------------------------------------------------------------- */
/* affiliate_commission_events  (the ledger — APPEND ONLY)                    */
/* -------------------------------------------------------------------------- */

export const affiliatePayoutTable = pgTable(
	'affiliate_payouts',
	{
		id: text('id').notNull().primaryKey(),
		affiliateId: text('affiliate_id')
			.notNull()
			.references(() => affiliateProfileTable.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),

		// The cohort this run settles, stored as the first day of the month.
		// Payments received in March (cohort 2026-03-01) pay out on May 1.
		cohortMonth: date('cohort_month').notNull(),
		amount: decimal('amount', { precision: 12, scale: 2 }).notNull().default('0'),
		currency: text('currency').notNull().default('usd'),

		status: affiliatePayoutStatusEnum('status').notNull().default('PENDING'),
		stripeTransferId: text('stripe_transfer_id').unique(),
		stripeConnectAccountId: text('stripe_connect_account_id'),
		failureReason: text('failure_reason'),
		paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
		notes: text('notes'),
		createdBy: text('created_by').references(() => userTable.id, { onDelete: 'set null' })
	},
	(table) => [
		index('affiliate_payouts_affiliate_idx').on(table.affiliateId),
		// One payout per affiliate per cohort — a second run for the same month is a
		// no-op rather than a double-pay.
		uniqueIndex('affiliate_payouts_affiliate_cohort_uidx').on(
			table.affiliateId,
			table.cohortMonth
		),
		index('affiliate_payouts_status_idx').on(table.status)
	]
);

export const affiliateCommissionEventTable = pgTable(
	'affiliate_commission_events',
	{
		id: text('id').notNull().primaryKey(),
		affiliateId: text('affiliate_id')
			.notNull()
			.references(() => affiliateProfileTable.id, { onDelete: 'cascade' }),
		referralId: text('referral_id').references(() => affiliateReferralTable.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),

		sourceType: affiliateCommissionSourceEnum('source_type').notNull(),
		// The invoice / timesheet this was derived from. Kept as explicit FKs so the
		// admin console can join straight through for support.
		// NB: invoices.id is a uuid, not text.
		invoiceId: uuid('invoice_id').references(() => invoiceTable.id, { onDelete: 'set null' }),
		timesheetId: text('timesheet_id').references(() => timeSheetTable.id, {
			onDelete: 'set null'
		}),
		// Which side of the invoice earned this — the referred practice or the
		// referred professional. Both may earn on the same invoice, for different
		// affiliates, via two rows with distinct idempotency keys.
		referredUserId: text('referred_user_id').references(() => userTable.id, {
			onDelete: 'set null'
		}),

		// The commissionable base (regular hours only — overtime is excluded) and the
		// resulting commission, both in dollars.
		grossAmount: decimal('gross_amount', { precision: 12, scale: 2 }).notNull().default('0'),
		commissionAmount: decimal('commission_amount', { precision: 12, scale: 2 })
			.notNull()
			.default('0'),
		currency: text('currency').notNull().default('usd'),

		status: affiliateCommissionStatusEnum('status').notNull().default('PENDING'),
		// Calendar month of the INVOICE PAYMENT date, as the first of that month.
		cohortMonth: date('cohort_month').notNull(),
		// When the underlying invoice was paid — the fact that drives the cohort.
		revenueAt: timestamp('revenue_at', { withTimezone: true, mode: 'date' }).notNull(),

		payoutId: text('payout_id').references(() => affiliatePayoutTable.id, {
			onDelete: 'set null'
		}),

		// Stripe redelivers webhooks and the handler has no dedupe of its own. This
		// UNIQUE turns double-delivery into a no-op. Shape:
		//   invoice_paid:<invoiceId>:<affiliateId>
		//   reversal:<invoiceId>:<affiliateId>
		idempotencyKey: text('idempotency_key').notNull().unique(),

		// The rule that produced this number — rate, rate source, hours, and the
		// inputs. A rate change or a new per-affiliate override can therefore never
		// silently rewrite what was already earned.
		ruleSnapshot: text('rule_snapshot'),

		// Set on REVERSED rows, or on the negative adjustment that offsets an
		// already-paid event.
		reversalOfEventId: text('reversal_of_event_id'),
		reversedReason: text('reversed_reason'),
		notes: text('notes')
	},
	(table) => [
		index('affiliate_commission_events_affiliate_idx').on(table.affiliateId, table.status),
		// Backs the monthly payout run's "closed cohort, ready to pay" scan.
		index('affiliate_commission_events_cohort_idx').on(table.cohortMonth, table.status),
		index('affiliate_commission_events_invoice_idx').on(table.invoiceId),
		index('affiliate_commission_events_payout_idx').on(table.payoutId)
	]
);

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type AffiliateProfile = typeof affiliateProfileTable.$inferSelect;
export type NewAffiliateProfile = typeof affiliateProfileTable.$inferInsert;
export type AffiliateReferralCode = typeof affiliateReferralCodeTable.$inferSelect;
export type NewAffiliateReferralCode = typeof affiliateReferralCodeTable.$inferInsert;
export type AffiliateReferralClick = typeof affiliateReferralClickTable.$inferSelect;
export type NewAffiliateReferralClick = typeof affiliateReferralClickTable.$inferInsert;
export type AffiliateReferral = typeof affiliateReferralTable.$inferSelect;
export type NewAffiliateReferral = typeof affiliateReferralTable.$inferInsert;
export type AffiliateCommissionEvent = typeof affiliateCommissionEventTable.$inferSelect;
export type NewAffiliateCommissionEvent = typeof affiliateCommissionEventTable.$inferInsert;
export type AffiliatePayout = typeof affiliatePayoutTable.$inferSelect;
export type NewAffiliatePayout = typeof affiliatePayoutTable.$inferInsert;
