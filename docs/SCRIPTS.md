# Scripts manifest — `dental-staff-app`

Every runnable script in this app: what it does, when you'd reach for it, and how to run it safely.

**Run everything from `dental-staff-app/`.** Scripts load `.env` via `dotenv` (through the `drizzle.ts` import), so they hit whatever `DATABASE_URL` your `.env` currently points at. **Check which environment you're on before running anything that writes.**

> **Two databases.** Staging and production are kept in sync by hand. Anything that mutates data must be run deliberately against each. There is no automated promotion.

## Quick reference

| Script | Writes? | Dry-run? | Re-runnable? | Status |
|---|---|---|---|---|
| `backfill-candidate-address-components.ts` | yes | ✅ default | ✅ idempotent | Keep |
| `backfill-csv-import.ts` | yes | ✅ default | ✅ idempotent | Keep (needs CSV) |
| `backfill-s3-filenames.ts` | yes + S3 | ✅ `--dry-run` | ✅ idempotent | Keep |
| `backfill-ticket-numbers.sql` | yes (DDL) | no | ✅ idempotent | Keep |
| `diagnoseStripeCustomers.ts` | **no** | n/a | ✅ | Keep |
| `migrateStripeCustomers.ts` | yes | no | ⚠️ see notes | Keep, use with care |
| `_add-missing-disciplines.ts` | yes | no | ✅ idempotent | One-off, deletable |
| `_dump-discipline-and-experience.ts` | **no** | n/a | ✅ | One-off, deletable |
| `seed-dev.ts` | yes, **destructive** | no | ✅ | Dev only |

---

## npm scripts

```bash
npm run dev          # vite dev on :3000
npm run build        # production build (Node adapter)
npm run check        # svelte-kit sync && svelte-check
npm run lint         # prettier --check && eslint   ⚠️ see "Known issues"
npm run format       # prettier --write .
npm run test         # vitest run
npm run studio       # drizzle-kit studio — browse the DB in a UI
npm run generate     # drizzle-kit generate — write a migration from the schema diff
npm run migrate      # drizzle-kit push — APPLY schema to the DB
npm run seed-dev     # seed the dev DB (destructive)
npm run cron         # run the scheduled-jobs process
```

### `npm run generate` vs `npm run migrate`

- **`generate`** only writes files (a new `.sql` in `migrations/` plus a journal entry). It does **not** touch the database. Safe to run anytime.
- **`migrate`** runs `drizzle-kit push`, which **applies** the schema to whatever `DATABASE_URL` points at. Run per-environment, deliberately.

⚠️ **`push` can truncate.** Adding a `NOT NULL` column with no default makes `drizzle-kit push` drop and recreate the table. That's how `backfill-ticket-numbers.sql` came to exist — see it for the safe pattern (add nullable → backfill → enforce `NOT NULL`). When `generate` produces something that looks like it drops or recreates a table, **stop and write the SQL by hand.**

⚠️ **Generated migrations carry noise.** Because the schema uses `.default(new Date())` and `.default(crypto.randomUUID())`, every `generate` emits ~13 unrelated `ALTER COLUMN … SET DEFAULT '<timestamp/uuid>'` lines across 6 tables. They're harmless but meaningless; you can strip them and apply only the statements you actually intended.

---

## Data backfills

### `backfill-candidate-address-components.ts`

**Why:** `candidate_profiles` stored only the free-text `complete_address`. The Professionals index filters on `city` / `state` / `zipcode`, which existed as columns but were never populated. This fills them from the existing address strings.

**You should not normally need this again** — every write path (candidate onboarding, candidate profile edit, admin professional edit, bulk import, geocode queue) now keeps these columns in sync automatically. Reach for it only after a bulk import that bypassed those paths, or to mop up rows a parse previously failed on.

```bash
# 1. Always dry-run first — writes nothing, prints the parse/fail split
npx tsx src/lib/server/scripts/backfill-candidate-address-components.ts

# 2. Apply
npx tsx src/lib/server/scripts/backfill-candidate-address-components.ts --commit

# 3. Apply + resolve unparseable rows through Mapbox (see caveat below)
npx tsx src/lib/server/scripts/backfill-candidate-address-components.ts --commit --geocode
```

| Flag | Effect |
|---|---|
| `--commit` | Without it, nothing is written. |
| `--geocode` | Send rows the parser rejected to Mapbox (100ms throttle, one API call each). Ignored in dry-run. |
| `--limit=N` | Process at most N rows. Default 0 = unlimited. |
| `--report=PATH` | Defaults to `./backfill-reports/<iso>-address-(dryrun\|commit).json`. |

**Safety:** dry-run by default; only ever fills columns that are currently `NULL` (an existing value is never overwritten); rows it can't confidently parse are reported, not guessed at; idempotent.

**Caveat on `--geocode`:** the geocoder queries with `types=address,secondary_address` and `country=us`. It will **not** resolve non-US addresses or city-only strings like `"Tampa, FL"` (no street number). Those rows stay unresolved by design — inventing a centroid zip would put an address the professional doesn't live at into your zip filter.

**Reading the output:** `Already complete` does **not** mean "done" — it means the parse produced nothing the row didn't already have. Those rows are *stuck*, usually missing a zip. Check them with the queries in "Verifying a backfill" below.

**Last full run (staging, 2026-08-07):** 2,933 scanned → 2,919 updated, 14 unparseable. Post-run coverage 2,915 / 2,936 (99.3%). The ~21 remaining are non-US addresses (Canada, South Africa, Philippines, UAE, Brazil) and junk entries (`"1"`, `"TX"`, `"xx, Riverside, CA, xx"`) — a manual data-quality worklist, not a parser gap.

---

### `backfill-csv-import.ts`

**Why:** one-shot import of existing client + candidate profiles from a spreadsheet export.

**Never creates users.** Emails in the CSV are expected to already exist; missing ones are reported, never inserted.

```bash
# Dry-run, 50 per role
npx tsx src/lib/server/scripts/backfill-csv-import.ts --csv=src/lib/server/scripts/user-data.csv

# Smoke-test specific people
npx tsx src/lib/server/scripts/backfill-csv-import.ts --csv=... --only=a@x.com,b@x.com --commit

# Full run — only after reviewing a dry-run report
npx tsx src/lib/server/scripts/backfill-csv-import.ts --csv=... --commit
```

| Flag | Effect |
|---|---|
| `--csv=PATH` | **Required.** Absolute or workspace-relative. |
| `--commit` | Without it, nothing is written. |
| `--limit-per-role=N` | Default 50 in dry-run, 0 (unlimited) with `--commit`. |
| `--only=EMAIL[,…]` | Restrict to specific emails. Overrides `--limit-per-role`. |
| `--status-only` | Skip all field updates; write only `status` from CSV column AA. |
| `--report=PATH` | Defaults to `./backfill-reports/<iso>-(dryrun\|commit).json`. |

**Safety:** reconciliation gate — discipline and experience-level names are resolved against the DB before any row is touched; unresolved names hard-abort. Blank CSV cells mean "no update"; existing DB values win. Per-row transaction with retry on deadlock/connection errors. Idempotent.

**Note:** `user-data.csv` (886 KB) sits next to it and contains real personal data. Don't copy it around.

---

### `backfill-s3-filenames.ts`

**Why:** renames S3 keys and DB URLs containing URL-reserved characters (`#`, `?`, `&`, `%`) that break public links. Pairs with the upload-time sanitizer in `src/lib/server/uploads/service.ts` (present in **both** apps), so new uploads are already clean — this is for historical files.

```bash
npx tsx src/lib/server/database/backfill-s3-filenames.ts --dry-run
npx tsx src/lib/server/database/backfill-s3-filenames.ts          # live
```

Touches `users.avatar_url`, `client_companies.company_logo`, `candidate_document_uploads.upload_url`, `client_document_uploads.upload_url`.

⚠️ **This mutates object storage, not just the DB.** Per row it does CopyObject(old→new) → UPDATE → DeleteObject(old). An interrupted run can leave orphaned objects. Requires valid S3/Spaces credentials in `.env`.

---

### `backfill-ticket-numbers.sql`

**Why:** adds and backfills `support_tickets.ticket_number` (the human-friendly "Ticket #42"; the UUID `id` remains canonical).

**Run this instead of `npm run migrate` for that change** — `drizzle-kit push` would add the `NOT NULL serial` by truncating the table. This does it safely: add nullable → backfill → enforce `NOT NULL`.

```bash
psql "$DATABASE_URL" -f src/lib/server/scripts/backfill-ticket-numbers.sql
```

Idempotent, and the end state matches the Drizzle schema exactly, so a later `push` is a no-op. **Keep as the reference pattern for any future `NOT NULL` column added to a populated table.**

---

## Stripe

### `diagnoseStripeCustomers.ts` — READ-ONLY

**Why:** production Stripe customers have **UUID** ids (imported account). Some rows instead hold a real `cus_…` id, created by the setup flow running under TEST/LOCAL keys. Those don't resolve in prod, so invoicing throws *"No such customer"*.

For each `cus_`-shaped row it retrieves that id against the current keys, looks the client up by email to find the real UUID customer, and prints a proposed action. **Makes no writes.**

```bash
npx tsx src/lib/server/scripts/diagnoseStripeCustomers.ts
```

⚠️ **Point `.env` Stripe keys at PROD first**, or every lookup comes back empty and the output is meaningless. `.env` holds three key sets (TEST / PROD / LOCAL).

> A UUID in `stripe_customer_id` is **correct** in prod. The `cus_` rows are the corrupted ones. Don't "fix" it backwards.

### `migrateStripeCustomers.ts`

**Why:** matches client profiles to existing Stripe customers by email, writes the customer id back, and creates the missing `client_subscription` record. Only processes clients with no subscription row.

Exports a default function rather than self-executing — import and call it, or add a temporary entry point.

⚠️ No dry-run. Run `diagnoseStripeCustomers.ts` first and confirm the key set.

---

## One-off helpers (safe to delete)

Both are leftovers from the CSV import and are marked "delete after use". Kept for reference.

```bash
npx tsx src/lib/server/scripts/_add-missing-disciplines.ts        # inserts 4 disciplines (DOO, GM, OO, GL); idempotent
npx tsx src/lib/server/scripts/_dump-discipline-and-experience.ts # READ-ONLY; prints all disciplines + experience levels
```

---

## Dev seeding

```bash
npm run seed-dev
```

⚠️ **Destructive — dev only.** Wipes and regenerates users/sessions with Faker data. Creates the superadmin from `DEV_SUPERADMIN_EMAIL` / `DEV_SUPERADMIN_PASSWORD` in `src/lib/config/constants.ts`. **Never run against staging or production.**

---

## Scheduled jobs

`npm run cron` starts a **separate process** (`src/cron/index.ts`) that triggers jobs over HTTP. It refuses to start unless `CRON_SECRET` and `API_URL` are set, and it guards against overlapping runs of the same job.

| Job | Schedule |
|---|---|
| `processPastRecurrenceDays` | daily 12:00 AM ET |
| `processInvoiceReminders` | daily 7:00 AM ET |
| `processWorkday48HrReminder` | hourly |
| `processTimesheetCreation` | every 5 minutes |
| `processTimesheetAutoApproval` | hourly |
| `processOutdatedRequisitions` | daily 1:00 AM ET |
| `processCampaignQueue` | every minute |

Definitions live in `src/lib/server/jobs/registry.ts`. Job endpoints are thin shells — verify → lock → call a named service → return JSON; the domain logic belongs in `src/lib/server/<domain>/`.

⚠️ **Do not run more than one cron process per environment** — jobs would double-fire.

---

## Verifying a backfill

```sql
-- Coverage
SELECT count(*) AS total,
       count(*) FILTER (WHERE complete_address IS NOT NULL AND complete_address <> '') AS with_address,
       count(*) FILTER (WHERE city IS NOT NULL) AS with_city,
       count(*) FILTER (WHERE state IS NOT NULL) AS with_state,
       count(*) FILTER (WHERE zipcode IS NOT NULL) AS with_zip
FROM candidate_profiles;

-- Stragglers — the manual worklist
SELECT id, complete_address, address, city, state, zipcode
FROM candidate_profiles
WHERE complete_address IS NOT NULL AND complete_address <> ''
  AND (city IS NULL OR state IS NULL OR zipcode IS NULL);

-- Format checks — both should return nothing / 0
SELECT state, count(*) FROM candidate_profiles
WHERE state IS NOT NULL AND state !~ '^[A-Z]{2}$' GROUP BY state;

SELECT count(*) FROM candidate_profiles
WHERE zipcode IS NOT NULL AND zipcode !~ '^\d{5}$';

-- Eyeball 20 parses against their source string
SELECT complete_address, address, city, state, zipcode
FROM candidate_profiles WHERE city IS NOT NULL ORDER BY random() LIMIT 20;
```

**On the `address` column:** for CSV-imported rows it holds the *entire* original address string, not just the street — the importer wrote the same value into both `address` and `complete_address`, and geocoding later replaced only `complete_address`. Backfills leave it alone because it is non-NULL. Don't "normalize" it: Mapbox drops unit numbers (`"Suite 7-8"` vanished from one `complete_address`), so that raw column is sometimes the only place the unit survives.

---

## Known issues

- **`npm run lint` cannot pass.** `.prettierrc` sets `parser: "svelte"` for `*.svelte` but omits `prettier-plugin-svelte` from `plugins`, so prettier exits with `Couldn't resolve parser "svelte"` before eslint runs. Use `npx eslint <paths>` directly until the config is fixed. A few files also have pre-existing format drift (`_helpers/billing.ts`, `_helpers/phone.ts`, `_helpers/UTCTimezoneUtils.test.ts`).
- **`src/lib/server/database/migrate.ts` is an empty file.** It looks like a migration runner and isn't one. Deleting it would avoid confusion.
- **`$env` is unavailable under `tsx`.** Any module importing `$env/static/public` or `$env/static/private` fails with `ERR_MODULE_NOT_FOUND` when run outside Vite. This is why `mapbox.ts` (SvelteKit-facing, imports `$env`) is a thin wrapper over `mapbox-core.ts` (token passed in, no `$env`) — **scripts must import `mapbox-core`**. Use `process.env.*` in scripts; `.env` is already loaded.
- **`US_STATE_TIMEZONES` in `mapbox-core.ts` has no `DC` entry**, so DC addresses log `Unknown state code "DC"` and fall back to longitude. It resolves to `America/New_York` correctly, but by fallback rather than lookup.

## Adding a new script

1. Put it in `src/lib/server/scripts/`, prefix throwaways with `_`.
2. Header comment: why it exists, the exact run command, every flag, and its safety properties.
3. **Dry-run by default.** Require `--commit` to write.
4. Write a JSON report to `backfill-reports/` so a run can be audited afterward.
5. Never overwrite non-NULL columns unless that is explicitly the point.
6. Make it idempotent — assume it will be run more than once.
7. Import `mapbox-core`, not `mapbox`. Don't import `geocode-queue` (it pulls in `$env`, and its in-process queue dies when the script exits — call the geocoder directly and await it).
8. Add it to the table at the top of this file.
