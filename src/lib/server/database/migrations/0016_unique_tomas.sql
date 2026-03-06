ALTER TABLE "requisitions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "requisitions" ALTER COLUMN "status" SET DEFAULT 'PENDING'::text;--> statement-breakpoint
DROP TYPE "public"."requisition_status_enum";--> statement-breakpoint
CREATE TYPE "public"."requisition_status_enum" AS ENUM('PENDING', 'OPEN', 'CANCELED', 'CLOSED');--> statement-breakpoint
ALTER TABLE "requisitions" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"public"."requisition_status_enum";--> statement-breakpoint
ALTER TABLE "requisitions" ALTER COLUMN "status" SET DATA TYPE "public"."requisition_status_enum" USING "status"::"public"."requisition_status_enum";--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-06T19:37:31.281Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '6db5b952-4501-4714-9507-2fac983cbfae';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-03-06T19:37:31.283Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-06T19:37:31.283Z';