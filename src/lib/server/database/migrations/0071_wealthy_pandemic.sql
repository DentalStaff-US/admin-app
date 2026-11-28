ALTER TYPE "public"."conversation_type" ADD VALUE 'CLIENT_CANDIDATE';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_client_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."client_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_company_idx" ON "conversations" USING btree ("company_id");