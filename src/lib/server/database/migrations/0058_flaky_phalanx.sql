ALTER TABLE "timesheets" ADD COLUMN "admin_fee_override" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "timesheets" ADD COLUMN "admin_fee_type_override" text;--> statement-breakpoint
ALTER TABLE "timesheets" ADD COLUMN "admin_fee_applied" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "timesheets" ADD COLUMN "admin_fee_type_applied" text;--> statement-breakpoint
ALTER TABLE "timesheets" ADD COLUMN "admin_fee_source" text;