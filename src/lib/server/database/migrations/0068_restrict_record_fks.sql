ALTER TABLE "affiliate_commission_events" DROP CONSTRAINT "affiliate_commission_events_affiliate_id_affiliate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "affiliate_payouts" DROP CONSTRAINT "affiliate_payouts_affiliate_id_affiliate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_client_id_client_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "paper_invoice_transactions" DROP CONSTRAINT "paper_invoice_transactions_invoice_id_invoices_id_fk";
--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" DROP CONSTRAINT "recurrence_day_cancellations_recurrence_day_id_recurrence_days_id_fk";
--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" DROP CONSTRAINT "recurrence_day_cancellations_requisition_id_requisitions_id_fk";
--> statement-breakpoint
ALTER TABLE "recurrence_days" DROP CONSTRAINT "recurrence_days_requisition_id_requisitions_id_fk";
--> statement-breakpoint
ALTER TABLE "requisitions" DROP CONSTRAINT "requisitions_client_id_client_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "requisitions" DROP CONSTRAINT "requisitions_location_id_company_office_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_associated_client_id_client_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_associated_candidate_id_candidate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheet_expenses" DROP CONSTRAINT "timesheet_expenses_timesheet_id_timesheets_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheet_expenses" DROP CONSTRAINT "timesheet_expenses_candidate_id_candidate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "workdays" DROP CONSTRAINT "workdays_candidate_id_candidate_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "workdays" DROP CONSTRAINT "workdays_requisition_id_requisitions_id_fk";
--> statement-breakpoint
ALTER TABLE "workdays" DROP CONSTRAINT "workdays_recurrence_day_id_recurrence_days_id_fk";
--> statement-breakpoint
ALTER TABLE "affiliate_commission_events" ADD CONSTRAINT "affiliate_commission_events_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_client_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_invoice_transactions" ADD CONSTRAINT "paper_invoice_transactions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" ADD CONSTRAINT "recurrence_day_cancellations_recurrence_day_id_recurrence_days_id_fk" FOREIGN KEY ("recurrence_day_id") REFERENCES "public"."recurrence_days"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_day_cancellations" ADD CONSTRAINT "recurrence_day_cancellations_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_days" ADD CONSTRAINT "recurrence_days_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_client_id_client_companies_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client_companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_location_id_company_office_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."company_office_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_associated_client_id_client_profiles_id_fk" FOREIGN KEY ("associated_client_id") REFERENCES "public"."client_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_associated_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("associated_candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_expenses" ADD CONSTRAINT "timesheet_expenses_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_expenses" ADD CONSTRAINT "timesheet_expenses_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workdays" ADD CONSTRAINT "workdays_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workdays" ADD CONSTRAINT "workdays_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workdays" ADD CONSTRAINT "workdays_recurrence_day_id_recurrence_days_id_fk" FOREIGN KEY ("recurrence_day_id") REFERENCES "public"."recurrence_days"("id") ON DELETE restrict ON UPDATE cascade;