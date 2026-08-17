ALTER TABLE "mass_campaigns" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-17T22:02:58.129Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '43efca10-2305-46e6-93a9-0a5c4de7e5d8';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-08-17T22:02:58.134Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-17T22:02:58.134Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;