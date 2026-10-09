CREATE TYPE "public"."candidate_work_preference" AS ENUM('TEMP', 'PERMANENT', 'BOTH');--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "work_preference" "candidate_work_preference";--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "work_preference_updated_at" timestamp with time zone;