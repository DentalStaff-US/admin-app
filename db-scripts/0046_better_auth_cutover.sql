-- ============================================================================
-- Better Auth cutover — DATA script (RUN MANUALLY; not a drizzle migration)
-- ============================================================================
-- This file lives in db-scripts/ (NOT in the drizzle migrations folder) so it
-- is never picked up by `drizzle-kit push` / `drizzle-kit migrate`. Run it by
-- hand against the shared Postgres, ONCE — both apps see the result.
--
-- Apply order:
--   1) drizzle migration  src/lib/server/database/migrations/0046_bored_wolfpack.sql  (DDL)
--   2) this file                                                                       (data)
--
-- Rollback for both: db-scripts/0046_better_auth.rollback.sql
-- ============================================================================

BEGIN;

-- 1) Backfill Better Auth's required `name` from the existing first/last split.
--    New signups set name explicitly; this covers all pre-existing users.
UPDATE users
SET name = NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
WHERE name IS NULL;

-- 2) Move credential hashes into Better Auth's `account` table.
--    One credential account per user that currently has a password. The
--    custom Argon2id verify() in auth.ts keeps these existing hashes valid,
--    so NO user is forced to reset their password.
--    accountId = user id (stable), providerId = 'credential' (BA convention).
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    u.id,
    'credential',
    u.id,
    u.password,
    now(),
    now()
FROM users u
WHERE u.password IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM account a
    WHERE a.user_id = u.id AND a.provider_id = 'credential'
  );

-- 3) Forced re-login cutover: Lucia session cookies/tokens are not compatible
--    with Better Auth's session format, so existing sessions cannot be carried
--    over. Truncating logs everyone out once; sign-in works normally after.
--    NOTE: run this only at the moment of cutover (last step before/at deploy).
TRUNCATE sessions;

COMMIT;

-- Sanity checks (run manually after COMMIT):
--   SELECT count(*) FROM users WHERE password IS NOT NULL;     -- expected credential accounts
--   SELECT count(*) FROM account WHERE provider_id='credential';-- should match the above
--   SELECT count(*) FROM users WHERE name IS NULL;             -- only users with blank first+last
