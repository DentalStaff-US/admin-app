CREATE TABLE "candidate_unavailable_dates" (
	"candidate_id" text NOT NULL,
	"date" date NOT NULL,
	"note" text,
	"source" text DEFAULT 'CANDIDATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	CONSTRAINT "candidate_unavailable_dates_candidate_id_date_pk" PRIMARY KEY("candidate_id","date")
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "available_days" integer[];--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "available_days_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "available_days_source" text;--> statement-breakpoint
ALTER TABLE "candidate_unavailable_dates" ADD CONSTRAINT "candidate_unavailable_dates_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_unavailable_dates" ADD CONSTRAINT "candidate_unavailable_dates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_unavailable_dates_date_idx" ON "candidate_unavailable_dates" USING btree ("date");--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_available_days_check" CHECK ("candidate_profiles"."available_days" IS NULL OR (
				array_length("candidate_profiles"."available_days", 1) BETWEEN 1 AND 7
				AND "candidate_profiles"."available_days" <@ ARRAY[0,1,2,3,4,5,6]
				AND array_position("candidate_profiles"."available_days", NULL) IS NULL
			));