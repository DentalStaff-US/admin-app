ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-08-06T04:50:49.176Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-06T04:50:49.176Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-06T04:50:49.176Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-06T04:50:49.176Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-08-06T04:50:49.175Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-06T04:50:49.175Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-08-06T04:50:49.176Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-06T04:50:49.176Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-08-06T04:50:49.175Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-06T04:50:49.175Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '83329a97-5b8f-435d-b928-74625612aecc';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-08-06T04:50:49.182Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-08-06T04:50:49.182Z';--> statement-breakpoint
CREATE INDEX "candidate_profiles_city_idx" ON "candidate_profiles" USING btree (lower("city"));--> statement-breakpoint
CREATE INDEX "candidate_profiles_state_idx" ON "candidate_profiles" USING btree ("state");--> statement-breakpoint
CREATE INDEX "candidate_profiles_zipcode_idx" ON "candidate_profiles" USING btree ("zipcode");