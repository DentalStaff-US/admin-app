# db-scripts

Hand-run SQL that is **not** part of the drizzle migration history. Nothing here
is touched by `drizzle-kit push` (`npm run migrate`) or `drizzle-kit migrate` —
these files are run manually against the shared Postgres.

## Better Auth migration (Lucia → Better Auth)

Run order on the shared DB:

1. **DDL** — the drizzle migration:
   `src/lib/server/database/migrations/0046_bored_wolfpack.sql`
   (new `account` / `verification` / `two_factor` tables + session/user columns).
2. **Data** — `0046_better_auth_cutover.sql`:
   - backfills `users.name` from `first_name`/`last_name`,
   - copies credential hashes from `users.password` into the `account` table
     (existing Argon2id hashes keep working — no password resets),
   - `TRUNCATE sessions` → the one-time forced re-login at cutover.

**Rollback (both):** `0046_better_auth.rollback.sql` (data first, then DDL).
Note: it cannot un-truncate sessions (users just re-login), and the `ADD VALUE
'ADMIN'` enum addition isn't auto-reverted (harmless to leave).

## App env required before deploy

Both apps need `BETTER_AUTH_SECRET` in their `.env` (use the **same** value in
both so cross-app impersonation one-time tokens verify):

```
BETTER_AUTH_SECRET=<long random string, e.g. `openssl rand -base64 32`>
```
