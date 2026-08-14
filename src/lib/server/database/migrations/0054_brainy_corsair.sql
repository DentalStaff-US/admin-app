ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-08-14T17:26:07.501Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-14T17:26:07.501Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-14T17:26:07.501Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-14T17:26:07.501Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-08-14T17:26:07.500Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-14T17:26:07.500Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-08-14T17:26:07.501Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-14T17:26:07.501Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-14T17:26:07.499Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-14T17:26:07.499Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '31ddda69-c8b4-4d10-8d61-4065a49b1132';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-08-14T17:26:07.515Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-14T17:26:07.515Z';--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_street_one" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_street_two" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_city" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_state" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_zipcode" text;