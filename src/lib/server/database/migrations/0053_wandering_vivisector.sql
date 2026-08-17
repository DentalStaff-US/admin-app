ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-13T22:32:13.923Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-13T22:32:13.922Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-13T22:32:13.922Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'e4615caf-f253-4982-979c-32782d8ab977';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-08-13T22:32:13.927Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-13T22:32:13.927Z';--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "client_companies" ADD COLUMN "billing_contact_name" text;