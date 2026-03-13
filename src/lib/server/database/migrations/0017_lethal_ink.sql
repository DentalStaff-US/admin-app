ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:21:28.546Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '450e6e02-8f19-4c17-adf7-7eeff758eec1';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-03-12T17:21:28.549Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-03-12T17:21:28.549Z';--> statement-breakpoint
ALTER TABLE "workdays" ADD COLUMN "adjusted_hourly_rate" smallint;--> statement-breakpoint
ALTER TABLE "timesheets" DROP COLUMN "timesheet_hourly_rate_adjusted";