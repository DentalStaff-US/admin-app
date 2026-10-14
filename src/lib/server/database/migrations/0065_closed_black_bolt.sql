CREATE TYPE "public"."application_source" AS ENUM('CANDIDATE', 'ADMIN_RECOMMENDED');--> statement-breakpoint
ALTER TABLE "requisition_application" ADD COLUMN "source" "application_source" DEFAULT 'CANDIDATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "requisition_application" ADD COLUMN "recommended_by_user_id" text;--> statement-breakpoint
ALTER TABLE "requisition_application" ADD COLUMN "recommendation_note" text;--> statement-breakpoint
ALTER TABLE "requisition_application" ADD COLUMN "candidate_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requisition_application" ADD CONSTRAINT "requisition_application_recommended_by_user_id_users_id_fk" FOREIGN KEY ("recommended_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;