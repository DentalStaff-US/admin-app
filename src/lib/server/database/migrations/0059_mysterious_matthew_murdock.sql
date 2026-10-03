CREATE TABLE "candidate_cert_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" text NOT NULL,
	"discipline_id" text NOT NULL,
	"expires_on" date NOT NULL,
	"stage" text NOT NULL,
	"channels" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD COLUMN "discipline_id" text;--> statement-breakpoint
ALTER TABLE "disciplines" ADD COLUMN "requires_certification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_cert_reminders" ADD CONSTRAINT "candidate_cert_reminders_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_cert_reminders" ADD CONSTRAINT "candidate_cert_reminders_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_cert_reminders_unique_stage_idx" ON "candidate_cert_reminders" USING btree ("candidate_id","discipline_id","expires_on","stage");--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD CONSTRAINT "candidate_document_uploads_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_document_uploads_credential_idx" ON "candidate_document_uploads" USING btree ("candidate_id","discipline_id","expiry_date");--> statement-breakpoint
CREATE INDEX "candidate_document_uploads_expiry_idx" ON "candidate_document_uploads" USING btree ("expiry_date");