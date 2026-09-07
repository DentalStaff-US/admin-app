ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-09-03T02:56:10.396Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-09-03T02:56:10.396Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-09-03T02:56:10.395Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'fdcc0b23-ef36-4e16-965e-edef82545ba0';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-09-03T02:56:10.403Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-09-03T02:56:10.403Z';--> statement-breakpoint
CREATE INDEX "company_office_locations_company_id_idx" ON "company_office_locations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_office_locations_city_idx" ON "company_office_locations" USING btree (lower("city"));--> statement-breakpoint
CREATE INDEX "company_office_locations_state_idx" ON "company_office_locations" USING btree ("state");--> statement-breakpoint
CREATE INDEX "company_office_locations_zipcode_idx" ON "company_office_locations" USING btree ("zipcode");