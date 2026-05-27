ALTER TABLE "candidate_document_uploads" DROP CONSTRAINT "candidate_document_uploads_candidate_id_candidate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "client_document_uploads" DROP CONSTRAINT "client_document_uploads_client_id_client_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "requisition_application" DROP CONSTRAINT "requisition_application_client_id_client_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "requisitions" DROP CONSTRAINT "requisitions_client_id_client_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "requisitions" DROP CONSTRAINT "requisitions_location_id_company_office_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_associated_candidate_id_candidate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T19:08:32.233Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'a81990bd-8a21-4fd6-8b94-29328124415a';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-05-27T19:08:32.241Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-27T19:08:32.241Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD CONSTRAINT "candidate_document_uploads_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_document_uploads" ADD CONSTRAINT "client_document_uploads_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_application" ADD CONSTRAINT "requisition_application_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_client_id_client_companies_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_location_id_company_office_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."company_office_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_associated_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("associated_candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;