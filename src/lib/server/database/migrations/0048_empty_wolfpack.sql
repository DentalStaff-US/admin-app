CREATE TYPE "public"."mass_campaign_audience" AS ENUM('CANDIDATE', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."mass_campaign_channel" AS ENUM('SMS', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."mass_campaign_recipient_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."mass_campaign_status" AS ENUM('DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');--> statement-breakpoint
CREATE TABLE "mass_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text,
	"to_address" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"status" "mass_campaign_recipient_status" DEFAULT 'PENDING' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mass_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" "mass_campaign_channel" NOT NULL,
	"audience" "mass_campaign_audience" NOT NULL,
	"status" "mass_campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-07-03T18:47:23.495Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-07-03T18:47:23.495Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-07-03T18:47:23.495Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-07-03T18:47:23.495Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-07-03T18:47:23.493Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-07-03T18:47:23.493Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-07-03T18:47:23.495Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-07-03T18:47:23.495Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-07-03T18:47:23.493Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-07-03T18:47:23.493Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'c6d1a7bc-0df0-413b-9910-7ef2277d08e4';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-07-03T18:47:23.508Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-07-03T18:47:23.508Z';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "receive_sms" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mass_campaign_recipients" ADD CONSTRAINT "mass_campaign_recipients_campaign_id_mass_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."mass_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mass_campaign_recipients" ADD CONSTRAINT "mass_campaign_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mass_campaigns" ADD CONSTRAINT "mass_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mass_campaign_recipients_campaign_status_idx" ON "mass_campaign_recipients" USING btree ("campaign_id","status");