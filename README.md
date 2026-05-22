# dental-staff-app (Admin + Client Portal)

The internal admin portal and client (dental practice) portal for Dental Staff US, a dental temp-staffing platform. This is the largest of the three apps in the workspace and owns the canonical Postgres schema.

> This app is part of a three-repo workspace. See [`../CLAUDE.md`](../CLAUDE.md) for the full architecture overview, cross-cutting gotchas, and how this app relates to [`dtss-candidate-app`](../dtss-candidate-app/) and [`dtss-landing`](../dtss-landing/).

## Stack

- **Framework:** SvelteKit 2 + TypeScript, Node adapter
- **Database:** Postgres on Railway via Drizzle ORM (PostGIS enabled for location radius queries)
- **Auth:** Lucia 3 with the Drizzle Postgres adapter — email/password + Google OAuth
- **UI:** Tailwind + shadcn-svelte (bits-ui) with flowbite-svelte mixed in; `sveltekit-superforms` + `formsnap` + Zod for forms
- **Scheduling:** `node-schedule` cron jobs registered in `hooks.server.ts` (no separate worker)
- **External services:** Stripe, Resend / Brevo / AWS SES / SMTP, Twilio, AWS S3 / DigitalOcean Spaces, Google Maps, Mapbox, PostHog, Axiom

## Audience and roles

This app serves three roles defined in [src/lib/config/constants.ts](src/lib/config/constants.ts):

- `SUPERADMIN` — internal staff
- `CLIENT` / `CLIENT_STAFF` (`CLIENT_ADMIN`, `CLIENT_MANAGER`, `CLIENT_EMPLOYEE`) — dental practices
- `CANDIDATE` — **not allowed here.** [hooks.server.ts](src/hooks.server.ts) hard-redirects candidate sessions to `CANDIDATE_APP_DOMAIN` and invalidates the session. Candidates live in [`dtss-candidate-app`](../dtss-candidate-app/).

## Getting started

```bash
cp sample.env .env        # then fill in secrets — DATABASE_URL, BASE_URL, CANDIDATE_APP_DOMAIN, Stripe/Twilio/Resend/AWS/Mapbox keys
npm install
npm run migrate           # drizzle-kit push — apply schema to your DB
npm run seed-dev          # optional — populate the dev DB
npm run dev               # http://localhost:3000
```

## Scripts

```bash
npm run dev          # vite dev on port 3000
npm run build        # vite build (Node adapter output)
npm run preview      # preview built bundle
npm run check        # svelte-kit sync && svelte-check
npm run lint         # prettier --check . && eslint .
npm run format       # prettier --write .
npm run generate     # drizzle-kit generate — write a new migration from schema diff
npm run migrate      # drizzle-kit push — apply schema directly (dev workflow)
npm run studio       # drizzle-kit studio — DB browser UI
npm run seed-dev     # tsx src/lib/server/database/seed-dev.ts
```

There is no test runner configured. "Run tests" here means `npm run check` + `npm run lint`.

## Project layout

```
src/
├── hooks.server.ts                Session validation, role-based redirect, route gates, cron registration, Stripe webhook bypass
├── app.d.ts                       Lucia type extensions
├── routes/
│   ├── (marketing)/               Unauthenticated: sign-in, sign-up, password reset, email verification, OAuth callback
│   ├── (protected)/               Authenticated only — verified user required
│   │   ├── admin/                 SUPERADMIN-only area (additional gate via checkIsAdmin)
│   │   ├── clients/               Dental practice management
│   │   ├── professionals/         Candidate management (view from admin/client side)
│   │   ├── requisitions/          Job postings + recurrence
│   │   ├── calendar/              Scheduling view
│   │   ├── timesheets/            Workday timesheet review/approval
│   │   ├── invoices/              Billing
│   │   ├── inbox/                 Messaging
│   │   ├── locations/             Practice locations (geocoded)
│   │   ├── onboarding/            Client onboarding flow
│   │   ├── dashboard/, settings/, staff/, support/, _profile/
│   ├── (system)/                  Post-checkout / setup-complete flow
│   └── api/
│       ├── external/              JWT-authenticated REST API consumed by dtss-candidate-app
│       ├── webhooks/stripe/       Webhook receiver — bypasses session handling in hooks.server.ts
│       ├── stripe/, uploadFile/, locations/, disciplines/, experience/, jobs/, admin/
└── lib/
    ├── config/                    constants.ts (roles, radius, app env), zod-schemas.ts
    ├── components/                Reusable UI primitives + shadcn-svelte components
    ├── views/                     Page-shaped composites split by audience (admin/, client/)
    └── server/
        ├── lucia.ts               Lucia init, custom user attributes
        ├── log.ts                 Axiom (prod) + console (dev) structured logging
        ├── database/
        │   ├── drizzle.ts         Pool config tuned for Railway proxy
        │   ├── schemas/           Domain-grouped schema files (auth, client, candidate, requisition, …)
        │   ├── queries/           Domain-grouped query helpers — call these from routes
        │   ├── migrations/        Drizzle-managed — never hand-edit
        │   └── seed-dev.ts
        ├── jobs/                  node-schedule cron jobs (see Scheduled jobs below)
        ├── email/                 emailService.ts (multi-provider wrapper) + templates
        ├── sms/                   smsService.ts (Twilio)
        ├── notifications/         Unified in-app + external dispatch
        ├── uploads/               S3 / DO Spaces helpers
        ├── stripe.ts              Stripe SDK setup
        ├── mapbox.ts              Geocoding helpers
        └── geocode-queue.ts       Background geocoding
```

### Request lifecycle

[hooks.server.ts](src/hooks.server.ts) handles every request:

1. Validates the `client-session` Lucia cookie.
2. **Redirects `CANDIDATE`-role users** to `CANDIDATE_APP_DOMAIN` and invalidates the session.
3. Enforces auth gates by route group: `(protected)` requires a verified user; `(protected)/admin` additionally requires `checkIsAdmin(role)`.
4. Bypasses session handling for `/api/webhooks/stripe` so the raw body remains intact for signature verification.
5. Registers `node-schedule` cron jobs on first module load.

### Scheduled jobs

Cron jobs in [src/lib/server/jobs/](src/lib/server/jobs/) run inside the Node server process — there is no separate worker. Be careful when scaling instances.

- `processPastRecurrenceDaysJob` — recurring requisition rollover
- `processInvoiceRemindersJob` — invoice reminder emails
- `processWorkday48HrReminderJob` — 48-hour pre-shift reminders
- `processTimesheetCreationJob` — auto-create timesheets after shifts

### External API surface (`/api/external/*`)

JWT-authenticated endpoints consumed by `dtss-candidate-app` (shared `JWT_SECRET`). This is the integration surface between the two SvelteKit apps — business logic lives here so there's a single source of truth. When adding a candidate-facing feature, extend an endpoint here and call it from the candidate app's `+page.server.ts`.

## Database

The two SvelteKit apps **share the same Postgres database** (same `DATABASE_URL`) but each maintains its own Drizzle schema files and migration history. This app owns the canonical schema under [src/lib/server/database/schemas/](src/lib/server/database/schemas/). When changing a shared table, update both apps' schemas and run migrations from here first.

> Per workspace policy, request that the maintainer run migrations and SQL scripts — both databases are kept in sync manually.

## Environment

`PUBLIC_APP_ENV` distinguishes deploys: `DEVELOPMENT` | `STAGING` | `INTERNAL` | `PRODUCTION`. `BASE_URL` and `CANDIDATE_APP_DOMAIN` must be set; the candidate-redirect logic in `hooks.server.ts` relies on them. See [sample.env](sample.env) for the full list of required variables.
