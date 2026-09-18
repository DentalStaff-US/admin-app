-- affiliate_profiles.pid defaults to nextval('affiliate_pid_seq'). Drizzle's
-- sql`nextval(...)` default does not create the sequence (same trap as
-- candidate_profiles.puid / puid_seq in 0029 → fixed in 0033), so create it
-- here first. drizzle-kit push cannot do this — run it by hand before pushing.
CREATE SEQUENCE IF NOT EXISTS "public"."affiliate_pid_seq" START WITH 1000 INCREMENT BY 1;--> statement-breakpoint
CREATE TYPE "public"."affiliate_attribution_source" AS ENUM('COOKIE', 'URL', 'INVITE', 'MANUAL', 'SELF_REPORTED');--> statement-breakpoint
CREATE TYPE "public"."affiliate_commission_source" AS ENUM('TEMP_SHIFT_INVOICE_PAID', 'PERMANENT_PLACEMENT', 'SUBSCRIPTION', 'MANUAL_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."affiliate_commission_status" AS ENUM('PENDING', 'APPROVED', 'PAID', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."affiliate_payout_status" AS ENUM('PENDING', 'PROCESSING', 'PAID', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."affiliate_referral_status" AS ENUM('PENDING', 'QUALIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."affiliate_status" AS ENUM('PENDING', 'ACTIVE', 'ON_HOLD', 'DENIED');--> statement-breakpoint
CREATE TABLE "affiliate_commission_events" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"referral_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" "affiliate_commission_source" NOT NULL,
	"invoice_id" uuid,
	"timesheet_id" text,
	"referred_user_id" text,
	"gross_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "affiliate_commission_status" DEFAULT 'PENDING' NOT NULL,
	"cohort_month" date NOT NULL,
	"revenue_at" timestamp with time zone NOT NULL,
	"payout_id" text,
	"idempotency_key" text NOT NULL,
	"rule_snapshot" text,
	"reversal_of_event_id" text,
	"reversed_reason" text,
	"notes" text,
	CONSTRAINT "affiliate_commission_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cohort_month" date NOT NULL,
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "affiliate_payout_status" DEFAULT 'PENDING' NOT NULL,
	"stripe_transfer_id" text,
	"stripe_connect_account_id" text,
	"failure_reason" text,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	CONSTRAINT "affiliate_payouts_stripe_transfer_id_unique" UNIQUE("stripe_transfer_id")
);
--> statement-breakpoint
CREATE TABLE "affiliate_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pid" integer DEFAULT nextval('affiliate_pid_seq') NOT NULL,
	"status" "affiliate_status" DEFAULT 'PENDING' NOT NULL,
	"status_reason" text,
	"status_set_manually" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"organization_name" text,
	"website" text,
	"contact_email" text,
	"contact_phone" text,
	"commission_rate_override" numeric(5, 2),
	"override_reason" text,
	"override_set_by" text,
	"override_set_at" timestamp with time zone,
	"stripe_connect_account_id" text,
	"connect_charges_enabled" boolean DEFAULT false NOT NULL,
	"connect_payouts_enabled" boolean DEFAULT false NOT NULL,
	"connect_details_submitted" boolean DEFAULT false NOT NULL,
	"connect_requirements_due" text[],
	"connect_updated_at" timestamp with time zone,
	"agreed_to_terms_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"notes" text,
	"parent_affiliate_id" text,
	CONSTRAINT "affiliate_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "affiliate_profiles_pid_unique" UNIQUE("pid"),
	CONSTRAINT "affiliate_profiles_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id")
);
--> statement-breakpoint
CREATE TABLE "affiliate_referral_clicks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code_id" text,
	"affiliate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"user_agent" text,
	"referer" text,
	"landing_host" text,
	"landing_path" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"is_bot" boolean DEFAULT false NOT NULL,
	"bot_reason" text
);
--> statement-breakpoint
CREATE TABLE "affiliate_referral_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"code_normalized" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"label" text,
	"campaign" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "affiliate_referral_codes_code_normalized_unique" UNIQUE("code_normalized")
);
--> statement-breakpoint
CREATE TABLE "affiliate_referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"code_id" text,
	"referred_user_id" text NOT NULL,
	"referred_role" text NOT NULL,
	"attribution_source" "affiliate_attribution_source" NOT NULL,
	"click_id" integer,
	"status" "affiliate_referral_status" DEFAULT 'QUALIFIED' NOT NULL,
	"rejected_reason" text,
	"flagged_reason" text,
	"first_touch_at" timestamp with time zone,
	"signed_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_referrals_referred_user_id_unique" UNIQUE("referred_user_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "actor_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "action_history" ADD COLUMN "request_path" text;--> statement-breakpoint
ALTER TABLE "admin_config" ADD COLUMN "affiliate_commission_rate" numeric(5, 2) DEFAULT '2.50' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_config" ADD COLUMN "affiliate_payout_minimum" numeric(10, 2) DEFAULT '25.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_config" ADD COLUMN "affiliate_program_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_referral_id_affiliate_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."affiliate_referrals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_payout_id_affiliate_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_override_set_by_users_id_fk" FOREIGN KEY ("override_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referral_clicks" ADD CONSTRAINT "affiliate_referral_clicks_code_id_affiliate_referral_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."affiliate_referral_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referral_clicks" ADD CONSTRAINT "affiliate_referral_clicks_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referral_codes" ADD CONSTRAINT "affiliate_referral_codes_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_code_id_affiliate_referral_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."affiliate_referral_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_referrals" ADD CONSTRAINT "affiliate_referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_affiliate_idx" ON "affiliate_commission_events" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_cohort_idx" ON "affiliate_commission_events" USING btree ("cohort_month","status");--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_invoice_idx" ON "affiliate_commission_events" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "affiliate_commission_events_payout_idx" ON "affiliate_commission_events" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_affiliate_idx" ON "affiliate_payouts" USING btree ("affiliate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_payouts_affiliate_cohort_uidx" ON "affiliate_payouts" USING btree ("affiliate_id","cohort_month");--> statement-breakpoint
CREATE INDEX "affiliate_payouts_status_idx" ON "affiliate_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "affiliate_profiles_status_idx" ON "affiliate_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "affiliate_profiles_connect_acct_idx" ON "affiliate_profiles" USING btree ("stripe_connect_account_id");--> statement-breakpoint
CREATE INDEX "affiliate_referral_clicks_affiliate_idx" ON "affiliate_referral_clicks" USING btree ("affiliate_id","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_referral_clicks_code_idx" ON "affiliate_referral_clicks" USING btree ("code_id","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_referral_clicks_dedupe_idx" ON "affiliate_referral_clicks" USING btree ("code_id","ip_hash","user_agent_hash","created_at");--> statement-breakpoint
CREATE INDEX "affiliate_referral_codes_affiliate_idx" ON "affiliate_referral_codes" USING btree ("affiliate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_referral_codes_primary_uidx" ON "affiliate_referral_codes" USING btree ("affiliate_id") WHERE "affiliate_referral_codes"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "affiliate_referrals_affiliate_idx" ON "affiliate_referrals" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX "affiliate_referrals_status_idx" ON "affiliate_referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "action_history_entity_idx" ON "action_history" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "action_history_user_idx" ON "action_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "action_history_created_idx" ON "action_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "action_history_meta_timesheet_idx" ON "action_history" USING btree (("metadata"->>'timesheetId'));--> statement-breakpoint
CREATE INDEX "action_history_meta_requisition_idx" ON "action_history" USING btree (("metadata"->>'requisitionId'));