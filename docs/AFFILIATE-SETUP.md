# Affiliate Program — Setup & Operations Runbook

Every step needed to stand the affiliate program up in an environment, in the order
it must happen, plus how the pieces fit together across the four apps.

This was written from the actual dev bring-up, so **running it top to bottom on
production reproduces the same state**. Steps marked **⚠️ ONE-WAY** are not
trivially reversible — read them before running them.

---

## 0. What this program does, in one paragraph

Any active practice or professional — plus external partners (schools, suppliers,
consultants, influencers) — gets a permanent referral link. Anyone can refer
anyone; there is no same-type restriction. When someone they referred generates a
paid temp-shift invoice, the affiliate earns **2.5% of the regular hours**
(`regular hours × rate`; **overtime excluded**). Commission accrues on payment,
is grouped into the calendar month of that payment, and is paid out on the **1st
of the month after next** (March payments → May 1) by Stripe Connect transfer
from the DTSS platform account. Balances under $25 roll forward.

---

## 1. Database

### 1.1 Create the sequence — **run BEFORE the schema push**

```sql
CREATE SEQUENCE IF NOT EXISTS affiliate_pid_seq;
```

`affiliate_profiles.pid` is a short, human-quotable public id for support
("affiliate #1042"), defaulted from this sequence. **Drizzle's `nextval()` default
does not create the sequence** — the same trap as the existing `puid_seq` on
`candidate_profiles`. If you push the schema first, the push fails.

### 1.2 Push the schema

From `dental-staff-app` **only** — it is the single source of truth for the schema
of all databases and apps:

```bash
cd dental-staff-app
npm run migrate          # drizzle-kit push
```

> ### ⚠️ ORDERING: migrate the database BEFORE deploying the code
>
> This migration is **purely additive** — six new tables, plus three new
> `admin_config` columns that are all `NOT NULL` with a `DEFAULT`. Nothing is
> dropped, renamed or retyped.
>
> That means it is **backward compatible**: old code running against the migrated
> database is completely fine, because it asks for the old column list and simply
> never sees the new columns.
>
> The reverse is **not** safe. Drizzle emits an explicit column list, not
> `SELECT *`, so the moment the new code is deployed it starts asking for
> `affiliate_commission_rate` and friends. Four existing call sites do a bare
> `db.select().from(adminConfigTable)`, and two are on hot paths:
>
> - `src/lib/server/timesheets/approveTimesheet.ts` — **timesheet approval**, manual *and* the auto-approve cron
> - `src/routes/(protected)/timesheets/[id]/+page.server.ts` — timesheet detail page and admin override
> - `src/routes/(protected)/admin/menu/application-settings/+page.server.ts` — settings page
>
> | Code | Database | Result |
> |---|---|---|
> | old | migrated | ✅ safe — extra columns are invisible to it |
> | old | unmigrated | ✅ safe — nothing has changed for it |
> | **new** | **unmigrated** | ❌ **timesheet approval throws** |
>
> So per environment: **migrate first, deploy second**, and keep the gap short.
> Never deploy the code ahead of the schema.
>
> Because this workspace keeps **two databases in sync by hand**, repeat §1.1 →
> §1.3 against each one before that environment's deploy. Migrating one does not
> migrate the other.

This creates six tables and extends one:

| Table | What it holds |
|---|---|
| `affiliate_profiles` | One per participating user. Status, Connect account, rate override |
| `affiliate_referral_codes` | The permanent primary code (+ future campaign codes) |
| `affiliate_referral_clicks` | Click log, with bots flagged rather than dropped |
| `affiliate_referrals` | The permanent user→affiliate link |
| `affiliate_commission_events` | The append-only ledger |
| `affiliate_payouts` | Monthly payout batches |
| `admin_config` *(extended)* | `affiliate_commission_rate`, `affiliate_payout_minimum`, `affiliate_program_enabled` |

**Verify the constraints landed** — these are the ones that prevent double-paying
and broken attribution:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename LIKE 'affiliate%' AND indexdef LIKE '%UNIQUE%'
ORDER BY tablename;
```

Expect at least:
- `affiliate_commission_events.idempotency_key` unique — stops webhook redelivery double-paying
- `affiliate_referrals.referred_user_id` unique — a referral is permanent and can never be reassigned
- `affiliate_referral_codes.code_normalized` unique — `DTSS-SMILE` and `dtss-smile` cannot both exist
- `affiliate_referral_codes_primary_uidx` (partial) — exactly one primary code per affiliate
- `affiliate_payouts_affiliate_cohort_uidx` — one payout per affiliate per cohort

### 1.3 Set the program config

The program ships **off**. Turn it on only when you're ready.

Once the app is deployed this is editable in the UI at
**Admin → Admin Menu → Affiliate Program** (`/admin/menu/affiliates`,
superadmin only) — which is the preferred route, since it logs the change. SQL is
here for first-time bring-up before a deploy:

```sql
UPDATE admin_config SET
  affiliate_commission_rate = 2.50,   -- percent of regular hours
  affiliate_payout_minimum  = 25.00,  -- balances below this roll forward
  affiliate_program_enabled = false;  -- flip to true to go live
```

That same admin screen is where you manage the program day to day: per-affiliate
rate overrides, hold/deny with a required reason, the flagged-referral review
queue, and payout history including failed transfers with their Stripe error.

While `affiliate_program_enabled = false`: the API returns 503 and the payout job
no-ops, **but `?ref=` capture still runs**. That's intentional — you can collect
attribution during a soft launch and switch the program on later with the history
already accumulated.

**Confirm the platform fee**, which is a *separate* setting and unrelated to
commission:

```sql
SELECT admin_payment_fee, admin_payment_fee_type FROM admin_config;
```

It defaults to `0` in the schema but is **50 PERCENTAGE** in the live config. It
does not affect how commission is *calculated* — that is always regular hours ×
the affiliate rate — but it is the main input to the margin-share figures below.

### 1.3.1 What the program actually costs

Worked example at the live 50% administration fee, a card-paying practice, 40
regular hours at $45/hr:

| | Amount |
|---|---|
| Regular-hours labor — the commission base | $1,800.00 |
| Administration Fee (50%, regular hours only) | $900.00 |
| Processing Fee (3%) | $81.00 |
| **Invoice total** | **$2,781.00** |
| **DTSS revenue** | **$981.00** |
| **Affiliate commission @ 2.5%** | **$45.00** |
| **Commission as a share of DTSS revenue** | **4.6%** |

Because the commission base and the Administration Fee are both computed from
regular hours only, that share stays flat as overtime rises — overtime increases
neither. A two-sided referral (the practice and the professional each referred by
a different affiliate) doubles it to roughly 9%.

Sanity-check this whenever `admin_payment_fee` changes: the affiliate rate is
fixed against *labor*, so lowering the platform fee raises commission's share of
margin proportionally.

### 1.4 ⚠️ ONE-WAY — dropping the dead `referral_keys` table (optional, separate)

`referral_keys` is a legacy table from migration `0000` with no FK, no unique
constraint and **zero code references**. It is unrelated to this program.

Do **not** bundle this with the affiliate push. When you want it gone:

```sql
SELECT count(*) FROM referral_keys;   -- confirm 0 first
```

Then delete `src/lib/server/database/schemas/referral.ts` and push. `drizzle-kit
push` will emit `DROP TABLE referral_keys` — which is the desired outcome, but it
must be a deliberate, announced step.

---

## 2. Environment variables

### `dental-staff-app`

| Variable | Required | Notes |
|---|---|---|
| `PUBLIC_COOKIE_DOMAIN` | prod only | `.dtstaffingsolutions.com`. **Leave unset in dev** — localhost ports already share cookies by hostname |
| `PUBLIC_PARTNER_PORTAL_URL` | **staging + prod** | Where the settings card links to. Three environments — local `http://localhost:4000`, staging a Railway URL, prod `https://partners.dtstaffingsolutions.com` — so this cannot be a `dev ? local : prod` ternary, and `PUBLIC_APP_ENV` cannot be used to branch (it is always `INTERNAL`). Falls back to localhost in dev and the prod domain otherwise |
| `AFFILIATE_IP_HASH_SECRET` | recommended | HMAC salt for click IP hashing. Falls back to `CRON_SECRET`, then a dev salt |
| `CRON_SECRET` | already set | Reused to sign the two new cron endpoints |
| `STRIPE_SECRET_KEY` | already set | Must be a key on an account with **Connect enabled** (§4) |
| `STRIPE_WEBHOOK_SECRET` | already set | The endpoint now also needs `account.updated` (§4.2) |

### `dtss-candidate-app`

| Variable | Required | Notes |
|---|---|---|
| `PUBLIC_COOKIE_DOMAIN` | prod only | Must be **identical** to the admin app's value |
| `JWT_SECRET` | already set | Must match the admin app — the attribution call is authenticated with it |

### `dtss-landing`

| Variable | Required | Notes |
|---|---|---|
| `PUBLIC_COOKIE_DOMAIN` | prod only | Must be identical to the other two |
| `PUBLIC_CLIENT_APP_URL` | already set | Used to append `?ref=` to outbound CTA links |
| `PUBLIC_PROFESSIONAL_APP_URL` | already set | Same |

> **The single most common misconfiguration** is `PUBLIC_COOKIE_DOMAIN` differing
> between apps, or being set in dev. All three must agree, and it must be **unset**
> locally. If they disagree, attribution silently stops crossing between the
> marketing site and the apps — clicks are logged but signups are never attributed.

---

## 3. Cron jobs

Two jobs are registered in `src/lib/server/jobs/registry.ts` and run in the
**dedicated cron Railway service** (`npm run cron`, `replicas: 1`) — not in the
web server.

| Job | Schedule (ET) | Endpoint | What it does |
|---|---|---|---|
| `processAffiliatePayouts` | monthly, 1st @ 04:00 | `/api/jobs/affiliates/processPayouts` | Approves matured commission, transfers via Connect |
| `reconcileAffiliateEligibility` | daily @ 03:00 | `/api/jobs/affiliates/reconcileEligibility` | Re-derives affiliate status from profile status |

No action needed beyond deploying — the cron service reads the registry. Both are
verified with `CRON_SECRET` and guarded with a Postgres advisory lock.

**Why the nightly reconcile is not optional:** client and candidate statuses get
edited directly in the DB during support work and by import scripts, where the
in-app sync hooks cannot observe them. Without the sweep, a deactivated account
could keep a live referral link and keep accruing.

---

## 4. Stripe Connect

### 4.1 Enable Connect on the DTSS account — **blocking**

In the Stripe Dashboard → **Connect** → get started. Enable **Express** accounts
with the **transfers** capability.

**Until this is done, the payout job runs but every transfer fails.** Everything
upstream (attribution, accrual, the ledger) works fine without it — this only
gates money actually moving.

Also decide: do transfers draw from the **platform balance**, or from a funded
reserve? Transfers fail if the platform balance is insufficient.

### 4.2 Add the `account.updated` webhook event

The existing endpoint (`/api/webhooks/stripe`) now handles `account.updated`. Add
that event type to the webhook in the Stripe Dashboard, alongside the existing
invoice and subscription events.

This is what flips `connect_payouts_enabled` to true once an affiliate finishes
Stripe's KYC. The payout run checks that flag; until it's true the affiliate's
balance simply carries forward rather than being lost.

### 4.3 What Stripe handles for us

Express accounts mean **Stripe hosts the identity verification and issues the
affiliate's 1099**. That is why tax-form generation is not on our roadmap.

---

## 5. Enrol existing users

Gives every ACTIVE practice and professional a profile and a permanent code, so
"everyone eligible already has a link" is true on day one.

```bash
cd dental-staff-app
npx tsx db-scripts/backfill-affiliate-profiles.ts            # dry run — prints counts
npx tsx db-scripts/backfill-affiliate-profiles.ts --commit   # writes
```

Idempotent — safe to re-run. It enrols **only ACTIVE** accounts, by design.
Re-run it after a batch of admin approvals to pick up the newly-active.

---

## 6. The affiliate portal app (`dtss-affiliate-app`)

A fourth SvelteKit app, dev port **4000**. It is a thin SSR shell: it owns **no**
affiliate tables and makes **no** Stripe calls — everything goes through
`/api/external/affiliate/*` in `dental-staff-app`, so business logic stays in one
place.

It exists as a separate app because the admin and candidate apps each *evict* the
other's role at the hooks level. The portal must welcome practices, professionals
and external partners alike, so it evicts nobody and gates on affiliate
eligibility instead.

### 6.1 Local

```bash
cd dtss-affiliate-app
cp .env.example .env     # then fill in the values below
npm install              # .npmrc sets legacy-peer-deps, matching the other apps
npm run dev              # http://localhost:4000
```

### 6.2 Environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Same Postgres as the other apps. This app declares only the Better Auth tables |
| `BETTER_AUTH_SECRET` | Its own secret. Cookie prefix is `dtss-partner`, keeping portal sessions separate from `dtss-admin` and the candidate app |
| `BETTER_AUTH_URL` | The portal's own origin |
| `ADMIN_APP_URL` | Where `/api/external/affiliate/*` lives |
| `JWT_SECRET` | **Must match `dental-staff-app`** — used to mint the 1-hour identity token. A mismatch makes every API call 401 |
| `PUBLIC_MARKETING_URL` | Used to build referral links (`/r?c=CODE`) |

### 6.3 Pinned dependency versions — do not float these

`package.json` pins three packages exactly, because the caret ranges drift into
incompatibility with the rest of the workspace:

- **`better-auth` 1.6.17** — 1.7.x requires `drizzle-orm >= 0.45`, while the other apps are on 0.44.2
- **`drizzle-orm` 0.44.2** — matches the other apps
- **`@sveltejs/kit` 2.65.0** — 2.70+ imports Svelte 5 runtime exports (`untrack`, `fork`, `settled`) that do not exist in Svelte 4

`.npmrc` carries `legacy-peer-deps=true`, same as `dtss-candidate-app`.

### 6.4 Deploy

A fourth Railway service running `npm run build` → `npm run start` (Node adapter),
with `partners.dtstaffingsolutions.com` pointed at it. Set
`PUBLIC_PARTNER_PORTAL_URL` on **both** existing apps to this host so their
settings links resolve.

### 6.5 How users get in

Two ways, both landing on the same portal:

- **Direct** — `/auth/sign-in` with their existing DTSS email and password (same `users` table, same Argon2id hashes).
- **Session handoff** — the settings link in either app points at `/affiliate-portal`, which mints a single-use token via Better Auth's `oneTimeToken()` plugin and redirects to the portal's `/auth/sso`. The user arrives already signed in. If minting fails they still land on the portal and simply sign in — a broken handoff is never a dead end.

---

## 7. DNS / hosting

| Item | Needed for |
|---|---|
| `partners.dtstaffingsolutions.com` → new Railway service | The affiliate portal app |
| `PUBLIC_COOKIE_DOMAIN=.dtstaffingsolutions.com` on all apps | One shared attribution cookie |
| `PUBLIC_PARTNER_PORTAL_URL` on both existing apps | Settings links resolving to the right host per environment |

All four properties are subdomains of one registrable domain
(`www` / `internal` / `app` / `partners`), and `dtstaffingsolutions.com` is not on
the Public Suffix List — which is why a single cookie works everywhere and there
is no cross-domain bridge to build or maintain.

---

## 7. How it works across the apps

### 7.1 Attribution

```
Affiliate shares  https://www.dtstaffingsolutions.com/r?c=ABCD2345
        │
        ▼
  RefCapture.astro (static, client-side)
    • writes  dtss_ref = CODE|ISO8601   on .dtstaffingsolutions.com, 90 days
    • FIRST TOUCH WINS — never overwrites an existing valid cookie
    • also appends ?ref= to outbound CTA links (cookie-blocked fallback)
        │
        ▼
  Visitor lands on internal.* or app.*
    • hooks.server.ts captures ?ref= BEFORE session resolution and BEFORE the
      role-eviction redirect — otherwise a logged-in professional clicking a link
      on the admin app would be redirected away before the cookie was written
    • admin app also logs the click (bots flagged, 30-min dedupe, IPs HMACed)
        │
        ▼
  Visitor signs up
    • admin app  : referral written INSIDE the existing signup transaction, so the
                   user is either fully set up AND attributed, or neither
    • candidate  : POSTs /api/external/affiliate/attribute after signup
        │
        ▼
  affiliate_referrals row — UNIQUE(referred_user_id) makes it permanent
```

**Why the cookie is not HttpOnly:** the static marketing site can only write it via
`document.cookie`. That's safe — a referral code is not a secret, and forging the
cookie achieves exactly what clicking the link achieves. Every real check happens
server-side at consume time (code exists, is active, affiliate is ACTIVE,
self-referral guard).

### 7.2 Earning

```
Practice pays an invoice
   │  Stripe: invoice.payment_succeeded   │  Paper: recordTransaction closes balance
   ▼                                       ▼
        accrueCommissionForPaidInvoice(invoiceId)
                    │
   ├─ temp shift only (has timesheet, requisition not permanent)
   ├─ finds affiliates for BOTH sides: whoever referred the practice AND
   │  whoever referred the professional (invoices.candidate_id). Each earns
   │  on their own side, as two rows with distinct idempotency keys
   ├─ base = REGULAR hours only, taken from the invoice line items (what the
   │  client actually paid), falling back to recomputation
   ├─ rate = affiliate override ?? admin_config.affiliate_commission_rate
   └─ writes PENDING event, cohort = month of payment (America/New_York)
```

The whole computation — rate, source, hours, base, and any invoice-vs-recompute
discrepancy — is frozen into the row's `rule_snapshot`. **A later rate change, or
adding a per-affiliate override, can never retroactively rewrite what was already
earned.**

### 7.3 Getting paid

```
1st of the month, 04:00 ET
   ├─ PENDING events in matured cohorts → APPROVED
   ├─ balance per affiliate (unpaid APPROVED, incl. negative clawbacks)
   ├─ skip: DENIED, or no Connect account, or payouts not yet enabled
   ├─ < $25 → roll forward
   └─ else: claim cohort → attach events → Stripe transfer → mark PAID
```

**Three independent defences against double-paying**, all required:
1. `UNIQUE(affiliate_id, cohort_month)` on `affiliate_payouts`
2. the advisory lock around the job
3. Stripe's own idempotency key on the transfer

Events are marked `PAID` **only after the transfer confirms**. A failed transfer
releases the events for the next run and leaves a `FAILED` payout row carrying the
Stripe error.

### 7.4 Eligibility

Affiliate status is **derived**, not set independently:

| Practice / professional profile | Affiliate status | Effect |
|---|---|---|
| `ACTIVE` | `ACTIVE` | Link works, commission accrues |
| `PENDING` / `INACTIVE` / `DENIED` | `ON_HOLD` | **No link, no new accrual — but any balance already earned still pays out** |
| *(external partner)* | admin-set | No internal status to derive from; `PENDING` until approved |

`DENIED` is terminal, freezes the balance for manual resolution, and is **never**
auto-cleared by a sync. A manual admin `ON_HOLD` also survives sync.

Blocking is **forward-only** — an admin stops future earning, but whatever is
already owed is reconciled and paid.

---

## 8. Verifying an environment

```bash
cd dental-staff-app && npm test && npm run check
```

Then, end to end:

1. **Attribution** — visit `/r?c=<CODE>` on the marketing site → confirm a
   `dtss_ref` cookie → sign up on the admin app → confirm one `affiliate_referrals`
   row with `attribution_source = 'COOKIE'` and the cookie cleared. Repeat via the
   candidate app to exercise the `/attribute` endpoint.
2. **First touch wins** — visit with code A, then code B, then sign up. The
   referral must be **A**.
3. **Self-referral** — sign up using the affiliate's own email. Expect a `REJECTED`
   row, not a silent skip.
4. **Eligibility** — flip a client ACTIVE → PENDING. Affiliate goes `ON_HOLD`, link
   stops resolving. Flip back → `ACTIVE`. Set a manual `DENIED`, run the nightly
   job, confirm it is **not** cleared.
5. **Accrual** — `stripe listen --forward-to localhost:3000/api/webhooks/stripe`,
   trigger `invoice.payment_succeeded` on a referred client's timesheet invoice.
   Confirm one event at exactly 2.5% of regular hours. **Replay the same event —
   confirm still exactly one row.** Confirm a 48-hour week pays the same as a
   40-hour week, and that a permanent-placement invoice produces no event.
6. **Reversal** — void that invoice → event flips to `REVERSED`.
7. **Connect** — complete Express onboarding in test mode → `account.updated`
   persists `payouts_enabled`.
8. **Payout** — seed events across two cohorts, run the job manually. Only the
   matured cohort pays; sub-$25 rolls forward. **Run it a second time — the
   advisory lock must make it a no-op.** Force a transfer failure → payout is
   `FAILED`, events stay `APPROVED`, nothing marked paid.

---

## 9. Production mirror checklist

In order. Nothing here is optional except where marked.

**Run this list once per database.** The workspace keeps two databases in sync by
hand — migrating one does not migrate the other. And within each environment the
schema must land **before** the code deploy (§1.2).

- [ ] `CREATE SEQUENCE IF NOT EXISTS affiliate_pid_seq;` (§1.1) — **before** the push
- [ ] `npm run migrate` from `dental-staff-app` only (§1.2)
- [ ] Verify the unique indexes (§1.2)
- [ ] Set `admin_config` affiliate columns, leaving `affiliate_program_enabled = false` (§1.3)
- [ ] Confirm the real `admin_payment_fee` value (§1.3)
- [ ] `PUBLIC_COOKIE_DOMAIN=.dtstaffingsolutions.com` on **all three** existing apps (§2)
- [ ] `AFFILIATE_IP_HASH_SECRET` on the admin app (§2)
- [ ] Enable Stripe **Connect / Express + transfers** (§4.1) — *blocking for payouts only*
- [ ] Decide platform balance vs funded reserve (§4.1)
- [ ] Add `account.updated` to the Stripe webhook (§4.2)
- [ ] Deploy admin app, candidate app, landing site
- [ ] Confirm the cron service picked up both new jobs (§3)
- [ ] Run the backfill: dry run, then `--commit` (§5)
- [ ] Walk §8 steps 1–4 against production with a test affiliate
- [ ] Flip `affiliate_program_enabled = true`
- [ ] *(optional, separate)* Drop `referral_keys` (§1.4)

---

## 10. Operational notes

**Rolling back.** Set `affiliate_program_enabled = false`. The portal goes dark and
the API returns 503, but `?ref=` capture keeps running and the ledger is untouched.
No redeploy, no schema change.

**The ledger is append-only.** Corrections are new rows — reversals and
adjustments — never edits or deletes. Anything that "fixes" a number by updating a
past row destroys the audit trail.

**Money conventions.** Ledger amounts are `numeric(12,2)` dollar strings, matching
`invoices`. Commission is computed in integer cents and rounded **half away from
zero exactly once**, at event creation. Never re-derive a stored amount.

**Cohorts are bucketed in `America/New_York`**, matching the cron and the business's
operating timezone. A payment at 23:00 ET on March 31 is April 1 in UTC — bucketing
in UTC would push it into the wrong cohort and pay it a month late.

**Clawbacks net immediately.** A refund on already-paid commission books a negative
row that reduces the *next* payout, rather than waiting for its own cohort to
mature two months later.

**Bots are flagged, never dropped.** When an affiliate asks why a post to 40k
followers shows 12 clicks, the answer needs to be "3,400 were link previews" —
which is impossible if the rows were discarded.
