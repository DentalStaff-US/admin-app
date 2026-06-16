-- ============================================================================
-- ROLLBACK for the Better Auth change (RUN MANUALLY; not a drizzle migration).
--   Reverts drizzle migration 0046_bored_wolfpack.sql + 0046_better_auth_cutover.sql.
-- ============================================================================
-- Run this to fully revert Better Auth's schema changes. Safe to run while the
-- app is rolled back to the Lucia codebase. Order: data first, then DDL.
--
-- IMPORTANT: reverting does NOT restore the sessions truncated at cutover —
-- users simply re-login under whichever codebase is live. That is expected.
-- ============================================================================

BEGIN;

-- Drop Better Auth tables (account holds the credential copies; the originals
-- still live in users.password, so no password data is lost on rollback).
DROP TABLE IF EXISTS "two_factor";
DROP TABLE IF EXISTS "verification";
DROP TABLE IF EXISTS "account";

-- Remove Better Auth columns from sessions.
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_token_unique";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "token";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "ip_address";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "user_agent";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "impersonated_by";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "created_at";
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "updated_at";

-- Remove Better Auth columns from users.
ALTER TABLE "users" DROP COLUMN IF EXISTS "name";
ALTER TABLE "users" DROP COLUMN IF EXISTS "banned";
ALTER TABLE "users" DROP COLUMN IF EXISTS "ban_reason";
ALTER TABLE "users" DROP COLUMN IF EXISTS "ban_expires";
ALTER TABLE "users" DROP COLUMN IF EXISTS "two_factor_enabled";

COMMIT;

-- ----------------------------------------------------------------------------
-- NOT auto-reverted (intentional):
--   * The `user_roles` enum value 'ADMIN' cannot be dropped without recreating
--     the type in Postgres. It is harmless to leave in place. To remove it you
--     must recreate the enum without 'ADMIN' and recast the users.role column.
-- ----------------------------------------------------------------------------
