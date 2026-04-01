ALTER TABLE "invoices" DROP CONSTRAINT "invoices_timesheet_id_timesheets_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_workday_id_workdays_id_fk";
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T20:41:20.064Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'cf67acc6-f923-4fb7-bf72-816a69a45677';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T20:41:20.067Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T20:41:20.067Z';--> statement-breakpoint
ALTER TABLE "workdays" ADD COLUMN "timesheet_id" text;--> statement-breakpoint
ALTER TABLE "workdays" ADD CONSTRAINT "workdays_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" DROP COLUMN "workday_id";--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_candidate_req_week_unique" UNIQUE("associated_candidate_id","requisition_id","week_begin_date");