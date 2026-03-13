ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:25:34.687Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '04126ea1-477d-412a-95a1-44ffc10fc102';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:25:34.689Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:25:34.689Z';--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "cell_phone" text;