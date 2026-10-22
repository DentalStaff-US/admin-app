CREATE TYPE "public"."skill_match_mode" AS ENUM('ALL', 'ANY');--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"candidate_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"created_by_user_id" text,
	CONSTRAINT "candidate_skills_candidate_id_skill_id_pk" PRIMARY KEY("candidate_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "requisition_skill_categories" (
	"requisition_id" integer NOT NULL,
	"category_id" text NOT NULL,
	"match_mode" "skill_match_mode" DEFAULT 'ALL' NOT NULL,
	CONSTRAINT "requisition_skill_categories_requisition_id_category_id_pk" PRIMARY KEY("requisition_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "requisition_skills" (
	"requisition_id" integer NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "requisition_skills_requisition_id_skill_id_pk" PRIMARY KEY("requisition_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skill_category_disciplines" (
	"category_id" text NOT NULL,
	"discipline_id" text NOT NULL,
	CONSTRAINT "skill_category_disciplines_category_id_discipline_id_pk" PRIMARY KEY("category_id","discipline_id")
);
--> statement-breakpoint
ALTER TABLE "skills" DROP CONSTRAINT "skills_category_id_skill_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "skill_categories" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "skill_categories" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD COLUMN "skill_id" text;--> statement-breakpoint
ALTER TABLE "skill_categories" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "skill_categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_categories" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "requires_certificate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_skill_categories" ADD CONSTRAINT "requisition_skill_categories_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_skill_categories" ADD CONSTRAINT "requisition_skill_categories_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_skills" ADD CONSTRAINT "requisition_skills_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_skills" ADD CONSTRAINT "requisition_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_category_disciplines" ADD CONSTRAINT "skill_category_disciplines_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_category_disciplines" ADD CONSTRAINT "skill_category_disciplines_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_skills_skill_idx" ON "candidate_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "requisition_skills_skill_idx" ON "requisition_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skill_category_disciplines_discipline_idx" ON "skill_category_disciplines" USING btree ("discipline_id");--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ADD CONSTRAINT "candidate_document_uploads_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_skill_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."skill_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_document_uploads_skill_credential_idx" ON "candidate_document_uploads" USING btree ("candidate_id","skill_id","expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_categories_name_unique" ON "skill_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "skills_category_idx" ON "skills" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_category_name_unique" ON "skills" USING btree ("category_id",lower("name"));