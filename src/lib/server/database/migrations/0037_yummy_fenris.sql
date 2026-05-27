CREATE TYPE "public"."client_status" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'DENIED');--> statement-breakpoint
ALTER TYPE "public"."candidate_status" ADD VALUE 'DENIED';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T03:27:20.117Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T03:27:20.116Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T03:27:20.116Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'c34524df-2c02-45d4-9c2e-0dda3ead7873';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T03:27:20.120Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T03:27:20.120Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "ssn_last4" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "ein_number" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "accountable_manager" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "client_status" "client_status" DEFAULT 'PENDING' NOT NULL;