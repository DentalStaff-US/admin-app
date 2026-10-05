CREATE TABLE "candidate_license_grace" (
	"candidate_id" text NOT NULL,
	"discipline_id" text NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_notified_at" timestamp with time zone,
	CONSTRAINT "candidate_license_grace_candidate_id_discipline_id_pk" PRIMARY KEY("candidate_id","discipline_id")
);
--> statement-breakpoint
ALTER TABLE "disciplines" RENAME COLUMN "requires_certification" TO "requires_license";--> statement-breakpoint
-- HAND-EDITED. drizzle-kit emitted this as a bare NOT NULL with no default, which
-- fails outright on any existing reminder row. Every row written so far came from
-- the single-credential model, where the date came from a linked document — which is
-- exactly what becomes the LICENSE track, so that default is the correct backfill.
--
-- The default is then dropped so new writes must state their track explicitly: a
-- silent default would let a certification reminder be filed as a license one, and
-- the unique index would suppress the real series.
ALTER TABLE "candidate_cert_reminders" ADD COLUMN "track" text NOT NULL DEFAULT 'LICENSE';--> statement-breakpoint
ALTER TABLE "candidate_cert_reminders" ALTER COLUMN "track" DROP DEFAULT;
--> statement-breakpoint
DROP INDEX "candidate_cert_reminders_unique_stage_idx";--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ADD COLUMN "requires_cert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ADD COLUMN "cert_expires_on" date;--> statement-breakpoint
ALTER TABLE "candidate_license_grace" ADD CONSTRAINT "candidate_license_grace_candidate_id_candidate_profiles_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidate_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_license_grace" ADD CONSTRAINT "candidate_license_grace_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cde_cert_expiry_idx" ON "candidate_discipline_experience" USING btree ("requires_cert","cert_expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_cert_reminders_unique_stage_idx" ON "candidate_cert_reminders" USING btree ("candidate_id","discipline_id","track","expires_on","stage");