CREATE TYPE "public"."client_document_type" AS ENUM('LICENSE', 'CERTIFICATE', 'AGGREEMENT', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."candidate_document_type" ADD VALUE 'AGGREEMENT' BEFORE 'OTHER';--> statement-breakpoint
CREATE TABLE "client_document_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT '2026-03-31T15:28:25.356Z' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2026-03-31T15:28:25.356Z' NOT NULL,
	"client_id" text NOT NULL,
	"upload_url" text NOT NULL,
	"expiry_date" timestamp with time zone,
	"type" "client_document_type" NOT NULL,
	"filename" text,
	"admin_only" boolean DEFAULT false
);
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-31T15:28:25.356Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '317cecad-1621-47d2-bcc6-f2632ee67ab4';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-03-31T15:28:25.359Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-31T15:28:25.359Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD COLUMN "admin_only" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "client_document_uploads" ADD CONSTRAINT "client_document_uploads_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE no action ON UPDATE no action;