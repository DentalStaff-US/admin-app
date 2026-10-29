CREATE TYPE "public"."signature_request_status" AS ENUM('PENDING', 'SENT', 'OPENED', 'AWAITING_COUNTERSIGN', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE SEQUENCE "public"."affiliate_pid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."puid_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5000 CACHE 1;--> statement-breakpoint
CREATE TABLE "compliance_snoozes" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"rule_key" text NOT NULL,
	"snoozed_until" date NOT NULL,
	"note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_request_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"channels" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"client_id" text,
	"recipient_user_id" text,
	"recipient_email" text NOT NULL,
	"recipient_name" text NOT NULL,
	"documenso_envelope_id" text,
	"documenso_recipient_id" integer,
	"signing_url" text,
	"countersigners" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "signature_request_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"subject_signed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"signed_file_key" text,
	"client_document_upload_id" uuid,
	"nudges_exhausted_at" timestamp with time zone,
	"created_by" text,
	CONSTRAINT "signature_requests_documenso_envelope_id_unique" UNIQUE("documenso_envelope_id")
);
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_id_unique";--> statement-breakpoint
ALTER TABLE "paper_invoice_transactions" DROP CONSTRAINT "paper_invoice_transactions_id_unique";--> statement-breakpoint
ALTER TABLE "compliance_snoozes" ADD CONSTRAINT "compliance_snoozes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_request_reminders" ADD CONSTRAINT "signature_request_reminders_request_id_signature_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_client_document_upload_id_client_document_uploads_id_fk" FOREIGN KEY ("client_document_upload_id") REFERENCES "public"."client_document_uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_snoozes_item_uidx" ON "compliance_snoozes" USING btree ("subject_type","subject_id","rule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_request_reminders_stage_idx" ON "signature_request_reminders" USING btree ("request_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_requests_open_per_subject_idx" ON "signature_requests" USING btree ("kind","subject_id") WHERE status in ('PENDING', 'SENT', 'OPENED', 'AWAITING_COUNTERSIGN');--> statement-breakpoint
CREATE INDEX "signature_requests_client_idx" ON "signature_requests" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "signature_requests_status_idx" ON "signature_requests" USING btree ("status");