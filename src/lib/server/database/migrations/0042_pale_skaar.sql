ALTER TABLE "candidate_document_uploads" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."candidate_document_type";--> statement-breakpoint
CREATE TYPE "public"."candidate_document_type" AS ENUM('RESUME', 'LICENSE', 'CERTIFICATE', 'AGREEMENT', 'OTHER');--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "type" SET DATA TYPE "public"."candidate_document_type" USING "type"::"public"."candidate_document_type";--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."client_document_type";--> statement-breakpoint
CREATE TYPE "public"."client_document_type" AS ENUM('LICENSE', 'CERTIFICATE', 'AGREEMENT', 'OTHER');--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "type" SET DATA TYPE "public"."client_document_type" USING "type"::"public"."client_document_type";--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-28T20:43:27.285Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-28T20:43:27.284Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-28T20:43:27.284Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '08fc2ec1-a819-497d-baa1-d8700a86604e';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-05-28T20:43:27.288Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-28T20:43:27.288Z';--> statement-breakpoint
ALTER TABLE "client_subscriptions" ADD CONSTRAINT "client_subscriptions_client_id_unique" UNIQUE("client_id");