CREATE TYPE "public"."paper_invoice_transaction_status" AS ENUM('SUCCESSFUL', 'PENDING', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."paper_invoice_transaction_type" AS ENUM('PAYMENT', 'REFUND', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "paper_invoice_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"timesheet_id" text,
	"batch_number" text,
	"transaction_type" "paper_invoice_transaction_type" DEFAULT 'PAYMENT' NOT NULL,
	"status" "paper_invoice_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"details" jsonb,
	CONSTRAINT "paper_invoice_transactions_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-04-16T20:59:45.901Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-04-16T20:59:45.901Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-04-16T20:59:45.901Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-04-16T20:59:45.901Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-04-16T20:59:45.900Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-04-16T20:59:45.900Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-04-16T20:59:45.900Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-04-16T20:59:45.900Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-04-16T20:59:45.900Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-04-16T20:59:45.900Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT '725be874-c79d-4fcb-b0d3-7c0e2654800a';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-04-16T20:59:45.903Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-04-16T20:59:45.903Z';--> statement-breakpoint
ALTER TABLE "paper_invoice_transactions" ADD CONSTRAINT "paper_invoice_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_invoice_transactions" ADD CONSTRAINT "paper_invoice_transactions_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_invoice_transaction_invoice_idx" ON "paper_invoice_transactions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "paper_invoice_transaction_timesheet_idx" ON "paper_invoice_transactions" USING btree ("timesheet_id");--> statement-breakpoint
CREATE INDEX "paper_invoice_transaction_status_type_idx" ON "paper_invoice_transactions" USING btree ("status","transaction_type");