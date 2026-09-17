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
| `STRIPE_WEBHOOK_SECRET` | already set | Signs the platform-account endpoint |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | prod | Signs the **second**, connected-accounts endpoint (§4.2). Optional locally — `stripe listen` uses one secret for both |

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
| `processAffiliatePayouts` | monthly, 1st @ 04:00 | `/api/jobs/affiliates/processPayouts` | Approves matured commission, transfers via Connect, emails "payout sent"; emails admins on any failure |
| `reconcileAffiliateEligibility` | daily @ 03:00 | `/api/jobs/affiliates/reconcileEligibility` | Re-derives affiliate status from profile status |
| `reconcileAffiliateFinance` | daily @ 03:30 | `/api/jobs/affiliates/reconcileFinance` | Re-syncs every Connect account from Stripe; **retries `FAILED` payouts** from the last 60 days |
| `notifyUpcomingAffiliatePayouts` | monthly, 26th @ 10:00 | `/api/jobs/affiliates/notifyUpcomingPayouts` | "Your $X is coming on the 1st" heads-up |

No action needed beyond deploying — the cron service reads the registry. All are
verified with `CRON_SECRET` and guarded with a Postgres advisory lock.
`reconcileAffiliateFinance` shares the payout lock (it can call the payout run)
and is scheduled at 03:30 so it can never overlap the 04:00 monthly run.

**Why the nightly reconcile is not optional:** client and candidate statuses get
edited directly in the DB during support work and by import scripts, where the
in-app sync hooks cannot observe them. Without the sweep, a deactivated account
could keep a live referral link and keep accruing.

---

## 3.1 Emails

All affiliate emails live in `src/lib/server/affiliate/notifications.ts`, use
the standard `EmailService`, respect `users.receive_email`, and are
**fire-and-forget** — a notification failure can never fail a payout, a webhook
or a signup. That also means a broken email config fails *quietly*, in the logs
(`affiliate email failed: …`), not loudly. Check logs after the first real run.

| Email | To | Trigger |
|---|---|---|
| New referral | affiliate | someone signs up through their link (QUALIFIED only — not flagged ones) |
| Payout coming | affiliate | the 26th, if they'll be paid on the 1st |
| Payout sent | affiliate | a transfer succeeds |
| Payout failures | **admins** | any run with a `FAILED` payout |

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

### 4.2 The `account.updated` webhook — needs a SECOND endpoint

`account.updated` for an affiliate's Express account is a **connected-account
event**, and Stripe has a hard constraint: a webhook endpoint listens to either
*your account's* events or *connected accounts'* events — never both. So the same
URL must be registered **twice** in the Dashboard.

| Endpoint | Type | Events | Signing secret env var |
|---|---|---|---|
| `…/api/webhooks/stripe` | **Events on your account** *(existing)* | the 10 invoice/subscription/checkout events | `STRIPE_WEBHOOK_SECRET` |
| `…/api/webhooks/stripe` | **Events on Connected accounts** *(new)* | `account.updated` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

**Developers → Webhooks → Add endpoint** — the account-vs-connected radio is the
first choice on that screen. Each registration gets its own signing secret; the
handler tries both. `STRIPE_CONNECT_WEBHOOK_SECRET` is optional, so a
single-secret setup (dev with `stripe listen`) keeps working.

**This must be done per environment** — the sandbox has its own endpoints and
Connect enablement; nothing propagates from live.

#### Environment matrix

Staging is the odd one out: it shares BOTH the database and the Stripe sandbox
with local development, but has its own webhook endpoints.

| | Database | Stripe | Webhook delivery | Secrets come from |
|---|---|---|---|---|
| **Local** | dev | sandbox | `stripe listen` with both flags | the one `whsec_` the CLI prints |
| **Staging** | dev *(shared with local)* | sandbox *(shared with local)* | 2 Dashboard endpoints **in the sandbox** → staging URL | the sandbox Dashboard |
| **Prod** | prod | live | 2 Dashboard endpoints **in live** → prod URL | the live Dashboard |

Because local and staging share the sandbox, **every sandbox event is delivered
to both** — your local listener *and* staging's endpoint — and both write the
same row in the same dev DB. This is harmless (the sync is idempotent) and means
staging acts as a fallback delivery path when the local listener is down. Do not
be surprised when a Connect flag flips without your listener having logged it.

Connect must be enabled in the sandbox AND in live, separately (§4.1).

**Locally**, `stripe listen` needs the `--forward-connect-to` flag or
connected-account events are silently dropped:

```bash
stripe listen \
  --forward-to         localhost:3000/api/webhooks/stripe \
  --forward-connect-to localhost:3000/api/webhooks/stripe
```

**Why it matters:** `account.updated` is what flips `connect_payouts_enabled`
once an affiliate finishes Stripe's KYC, and the payout run checks that flag. As
a backstop against a missed webhook, the portal's `summary` endpoint reconciles
the flag directly from Stripe whenever it sees an account that exists but isn't
payouts-enabled yet — so a misconfigured subscription delays an affiliate until
their next portal visit rather than stranding them. The webhook is still the
primary path; get it right.

**To verify delivery end to end:** update the connected account's metadata (any
harmless key) and confirm `affiliate_profiles.connect_updated_at` moves.

### 4.3 When a transfer fails — how it gets reconciled

The most common failure is **insufficient platform balance** on the 1st. Nothing
automated can fix that; a human has to top up. So reconciliation is three layers:

1. **The run itself** marks the payout `FAILED` with Stripe's reason, releases
   the events back to `APPROVED` (never marked paid), and **emails every admin**
   the affiliate, amount and reason.
2. **Nightly retry** — `reconcileAffiliateFinance` re-attempts any `FAILED`
   payout from the last 60 days. Top up on the 2nd, money moves on the 3rd, not
   next month. A retry **reuses the `FAILED` row** (history preserved) and sends a
   fresh Stripe request rather than replaying the cached failure.
3. **Manual** — the `FAILED` row and its reason are visible in the admin
   console's payout history and in the payouts CSV.

**Keep the platform balance funded before the 1st.** Transfers draw from it; a
short balance fails every affiliate that month. Decide whether it's fed by
incoming invoice payments or a standing reserve.

### 4.4 What Stripe handles for us

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

## 8. How it works across the apps

### 8.1 Attribution

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

### 8.2 Earning

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
   │  client actually paid), falling back to recomputation. Lines are identified
   │  by their structural `category` (LABOR_REGULAR etc. — Stripe metadata /
   │  paper field); description string-matching survives ONLY for invoices
   │  created before the category rollout. The snapshot records which was used.
   ├─ rate = affiliate override ?? admin_config.affiliate_commission_rate
   └─ writes PENDING event, cohort = month of payment (America/New_York)
```

The whole computation — rate, source, hours, base, and any invoice-vs-recompute
discrepancy — is frozen into the row's `rule_snapshot`. **A later rate change, or
adding a per-affiliate override, can never retroactively rewrite what was already
earned.**

### 8.3 Getting paid

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

### 8.4 Eligibility

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

## 8.5 CSV exports — Admin → Admin Menu → Exports

`/admin/menu/exports` (superadmin only) is the home for **all** financial
downloads — the affiliate ones are the first two; invoicing and professional
wages exports are expected to join them. Optional inclusive From/To dates apply
to every export on the page.

```
/admin/menu/exports/affiliate-ledger?from=YYYY-MM-DD&to=YYYY-MM-DD
/admin/menu/exports/affiliate-payouts?from=…&to=…
```

- **Commission ledger** — one row per event: affiliate, invoice #, base, rate and
  its source, regular/overtime hours, commission, status, payout id, and for
  reversals which event they reverse and why. Enough to reconcile every dollar.
- **Payouts** — one row per payout: cohort, amount, status, Stripe transfer id,
  Connect account, paid-at, failure reason.

**Adding a new export** is one entry in `src/lib/server/export/registry.ts` plus
a function returning a CSV string. The core (`src/lib/server/export/csv.ts`)
handles RFC 4180 quoting, ISO dates, money as plain decimals so spreadsheets keep
them numeric, and formula-injection defusing.

---

## 9. Verifying an environment

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

9. **Category:** approve a fresh timesheet → confirm each line in `invoices.line_items` carries a
   `category` (paper) or `metadata.category` (Stripe), and the resulting commission event's
   `rule_snapshot.baseSource` is `INVOICE_LINE_CATEGORY`.
10. **Exports:** download both CSVs from `/admin/menu/exports`; open in a spreadsheet; confirm money
    columns are numeric and a clawback row shows a negative amount with `Reversal Of` populated.
11. **Failed-payout retry:** with an empty sandbox balance, run the payout job → `FAILED` + admin email.
    Fund the balance, run `reconcileAffiliateFinance` → the **same** payout row flips to `PAID` with a
    transfer id.
---

## 10. Staging checklist

Staging shares the dev database and the Stripe sandbox with local (§4.2 matrix),
so the schema and config steps are already done once dev is. What staging needs
of its own:

- [ ] `PUBLIC_PARTNER_PORTAL_URL` pointed at the staging portal host (§2)
- [ ] In the **sandbox** Dashboard: 2 webhook endpoints → the staging URL (§4.2)
- [ ] `STRIPE_WEBHOOK_SECRET` + `STRIPE_CONNECT_WEBHOOK_SECRET` from those sandbox endpoints
- [ ] Deploy all apps + confirm the cron service sees all four affiliate jobs (§3)

## 11. Production mirror checklist

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
- [ ] Register the webhook URL **twice** in the Dashboard: once for platform events, once for **Connected accounts** with `account.updated` (§4.2)
- [ ] Set `STRIPE_WEBHOOK_SECRET` **and** `STRIPE_CONNECT_WEBHOOK_SECRET` from those two endpoints (§2, §4.2)
- [ ] Verify delivery: touch a connected account's metadata, confirm `connect_updated_at` moves (§4.2)
- [ ] Deploy admin app, candidate app, landing site
- [ ] Confirm the cron service picked up all four affiliate jobs (§3)
- [ ] Run the backfill: dry run, then `--commit` (§5)
- [ ] Walk §9 steps 1–4 against production with a test affiliate
- [ ] Flip `affiliate_program_enabled = true`
- [ ] *(optional, separate)* Drop `referral_keys` (§1.4)

---

## 12. Operational notes

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
