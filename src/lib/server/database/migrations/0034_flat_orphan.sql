CREATE TYPE "public"."recurrence_day_cancellation_by_role" AS ENUM('SUPERADMIN', 'CLIENT', 'CLIENT_STAFF', 'CANDIDATE');--> statement-breakpoint
CREATE TABLE "recurrence_day_cancellations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"recurrence_day_id" text NOT NULL,
	"requisition_id" integer NOT NULL,
	"cancelled_by_user_id" text NOT NULL,
	"cancelled_by_role" "recurrence_day_cancellation_by_role" NOT NULL,
	"candidate_id" text,
	"shift_start" timestamp with time zone NOT NULL,
	"hours_before_shift" numeric,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-11T21:49:15.819Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '6336b5d2-0bc1-4d6e-854c-8fc7995e588b';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-05-11T21:49:15.823Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-05-11T21:49:15.823Z';--> statement-breakpoint
ALTER TABLE "workdays" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" ADD CONSTRAINT "recurrence_day_cancellations_recurrence_day_id_recurrence_days_id_fk" FOREIGN KEY ("recurrence_day_id") REFERENCES "public"."recurrence_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" ADD CONSTRAINT "recurrence_day_cancellations_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" ADD CONSTRAINT "recurrence_day_cancellations_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rdc_candidate_idx" ON "recurrence_day_cancellations" USING btree ("candidate_id","created_at");--> statement-breakpoint
CREATE INDEX "rdc_recurrence_day_idx" ON "recurrence_day_cancellations" USING btree ("recurrence_day_id");