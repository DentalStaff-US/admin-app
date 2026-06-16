ALTER TYPE "public"."user_roles" ADD VALUE 'ADMIN' BEFORE 'CLIENT';--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text,
	"backup_codes" text
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "created_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_discipline_experience" ALTER COLUMN "updated_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "created_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_profiles" ALTER COLUMN "updated_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "created_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "candidate_ratings" ALTER COLUMN "updated_at" SET DEFAULT '2026-06-11T20:56:25.767Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "created_at" SET DEFAULT '2026-06-11T20:56:25.766Z';--> statement-breakpoint
ALTER TABLE "client_document_uploads" ALTER COLUMN "updated_at" SET DEFAULT '2026-06-11T20:56:25.766Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "id" SET DEFAULT 'bebb2288-d292-4f46-bd5e-6fdd1060c641';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "created_at" SET DEFAULT '2026-06-11T20:56:25.772Z';--> statement-breakpoint
ALTER TABLE "admin_config" ALTER COLUMN "updated_at" SET DEFAULT '2026-06-11T20:56:25.772Z';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_unique" UNIQUE("token");