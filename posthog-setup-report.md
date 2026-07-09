<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the DTSS admin app (SvelteKit). The integration covers client-side initialization with session replay, server-side event tracking via the Node SDK, a reverse proxy to bypass ad blockers, user identification, and error capture.

## Files created or modified

| File                        | Change                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/lib/server/posthog.ts` | **Created** — server-side PostHog singleton (`getPostHogClient`)                                 |
| `src/hooks.client.ts`       | **Modified** — added PostHog `init()` with reverse proxy and `captureException` in `handleError` |
| `src/hooks.server.ts`       | **Modified** — added `/ingest` reverse proxy in `handle`, PostHog error capture in `handleError` |
| `src/routes/+layout.svelte` | **Modified** — added `posthog.identify()` when user is present, `posthog.reset()` on sign-out    |
| `svelte.config.js`          | **Modified** — added `paths.relative: false` (required for session replay)                       |
| `.env`                      | **Modified** — added `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST`                    |

## Events instrumented

| Event                              | Description                                                                               | File                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `user_signed_up`                   | Fired when a new user successfully creates an account (via direct registration or invite) | `src/routes/(marketing)/auth/sign-up/+page.server.ts`                                  |
| `user_signed_in`                   | Fired when a user successfully signs in with email/password                               | `src/routes/(marketing)/auth/sign-in/+page.server.ts`                                  |
| `user_signed_out`                  | Fired when a user successfully signs out                                                  | `src/routes/(marketing)/auth/sign-out/+page.server.ts`                                 |
| `invitation_accepted`              | Fired when a user accepts an admin or client staff invitation                             | `src/routes/(marketing)/auth/invite/[token]/+page.server.ts`                           |
| `location_created`                 | Fired when a client successfully creates a new company location                           | `src/routes/(protected)/locations/+page.server.ts`                                     |
| `support_ticket_created`           | Fired when a user submits a new support ticket                                            | `src/routes/(protected)/support/+page.server.ts`                                       |
| `application_approved`             | Fired when a client approves a candidate's requisition application                        | `src/routes/(protected)/requisitions/[id]/application/[applicationId]/+page.server.ts` |
| `application_conversation_started` | Fired when a client starts a conversation with a candidate                                | `src/routes/(protected)/requisitions/[id]/application/[applicationId]/+page.server.ts` |
| `subscription_checkout_started`    | Fired when a user initiates a Stripe subscription checkout                                | `src/routes/api/stripe/create-checkout-session/+server.ts`                             |
| `subscription_created`             | Fired via Stripe webhook when a new subscription is successfully created                  | `src/routes/api/webhooks/stripe/+server.ts`                                            |
| `subscription_cancelled`           | Fired via Stripe webhook when a subscription is deleted                                   | `src/routes/api/webhooks/stripe/+server.ts`                                            |
| `invoice_payment_succeeded`        | Fired via Stripe webhook when an invoice payment succeeds                                 | `src/routes/api/webhooks/stripe/+server.ts`                                            |
| `candidate_applied`                | Fired via external API when a candidate applies for a requisition                         | `src/routes/api/external/applyForRequisition/+server.ts`                               |
| `timesheet_submitted`              | Fired via external API when a candidate submits a timesheet                               | `src/routes/api/external/timesheets/submitTimesheetForCandidate/+server.ts`            |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/405004/dashboard/1531513
- **New signups over time:** https://us.posthog.com/project/405004/insights/l95yQd1w
- **Signup to sign-in conversion funnel:** https://us.posthog.com/project/405004/insights/iUItRdB1
- **Subscriptions created & cancelled over time:** https://us.posthog.com/project/405004/insights/ZKqViTzR
- **Candidate application-to-approval funnel:** https://us.posthog.com/project/405004/insights/DGDQFRQV
- **Invoice payments succeeded over time:** https://us.posthog.com/project/405004/insights/d6WSDu2d

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-sveltekit/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
