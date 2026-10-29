# E-Signatures (Documenso)

How documents get sent for signature, tracked and filed, and **how to add a new
document type**. Code lives in [`src/lib/server/signatures/`](../src/lib/server/signatures/).

---

## 0. How it works, in one paragraph

Documenso is the signing engine. It is self-hosted on Railway, with its own
Postgres, and is never modified. Our app talks to it only through its v2 API and
webhooks. Every document we send is a row in `signature_requests`.

1. **Send.** `requestSignature()` creates an envelope from a Documenso template,
   fills in labelled fields, and gets back each signer's personal signing link.
   Documenso sends **no emails**: envelopes are created with `distributionMethod:
   'NONE'`. We deliver the links ourselves, by branded email and SMS.
2. **Track.** A webhook tells us something changed on an envelope. We then
   **re-read the envelope from the API**; the webhook body itself is never
   trusted. A daily cron does the same for every open request, to catch missed
   webhooks.
3. **File.** When the envelope completes, we copy the signed PDF into private
   storage and file it wherever the document type says.

```
requestSignature ──► Documenso (/envelope/use) ──► signing links
        │                                               │
        ▼                                               ▼
 signature_requests ◄── sync ◄── webhook / daily cron   our email + SMS
        │
        └── COMPLETED ──► signed PDF → DO Spaces (private) → kind.onCompleted()
```

### Request lifecycle

```
PENDING ─► SENT ─► OPENED ─► AWAITING_COUNTERSIGN ─► COMPLETED
              └───────┴────────────┴──► REJECTED | CANCELLED | EXPIRED
PENDING ─► FAILED   (the Documenso call failed; nobody was sent anything)
```

- **Status only ever moves forward.** All the closed states rank the same, so
  nothing reopens a request. To try again, send a new one.
- **At most one open request per (kind, subject).** A partial unique index
  enforces this, so `requestSignature()` is safe to call twice.

---

## 1. Adding a new document type

A "kind" is one type of document, e.g. `CLIENT_AGREEMENT`. To add one you need a
Documenso template, an env var, a registry entry and a trigger. Sending,
webhooks, nudges, filing and the client/admin panels need no changes.

### 1.1 Build the template in Documenso

Under the team (staging: `dtss-documents-staging`) → **Templates**, upload the
PDF. If you start from a document, use **Save as Template** — never send the
draft.

**Rules the code relies on:**

| Rule | Why |
|---|---|
| The **first signer by signing order** is the subject: the client or professional the document is about. Leave their email blank, as a placeholder. | `planTemplateUse()` treats signer #1 as the subject and fills in their email and name on each send. |
| Every signer after that is a **countersigner**, with a real, fixed email. | Countersigners are emailed their link once the subject has signed, and reminded once 3 days later. |
| Turn **Enable signing order** on. | Countersigners must not be able to sign before the subject. |
| Values our app fills in must be **Text** fields with a **label**. | Prefill matches fields by label, ignoring case. Only `TEXT` fields can be prefilled. |
| Use **Name**, **Date** and **Signature** fields for anything the signer supplies. | Documenso fills Name from the signer and Date at signing time. |
| Set the template's **timezone to America/New_York** and give it a client-facing title. | The title appears in Documenso's UI. Our emails use the kind's `title` instead. |

You don't need to change the template's email settings. Every send overrides them.

### 1.2 Configure the template ID

The template ID is the `envelope_…` part of the template's URL. It is
**different in every environment**: staging and production have separate
Documenso instances, so you create the template twice.

Add an env var named `DOCUMENSO_TEMPLATE_<KIND>` in:
- your local `.env`
- `sample.env` (with an empty value)
- the Railway variables for the admin app in each environment

```
DOCUMENSO_TEMPLATE_HIPAA_BAA=envelope_xxxxxxxxxxxxxxxx
```

### 1.3 Add the registry entry

In [`kinds.ts`](../src/lib/server/signatures/kinds.ts), define the kind and add
it to `KINDS`:

```ts
const HIPAA_BAA: SignatureKindDefinition = {
	kind: 'HIPAA_BAA',                      // stored in signature_requests.kind — never rename
	subjectType: 'CLIENT',
	title: 'HIPAA Business Associate Agreement', // used in emails, settings and the admin panel
	templateId: () => env.DOCUMENSO_TEMPLATE_HIPAA_BAA,
	resolveSubject: resolveClientSubject,   // reuse for any client document
	prefill: (subject) => ({
		'Practice Name': subject.displayName // keys = Documenso field LABELS
	}),
	portalUrl: () => `${BASE_URL}/settings?tab=DOCUMENTS&role=CLIENT`,
	onCompleted: async ({ request, fileKey, filename }) => {
		if (!request.clientId) return {};
		const doc = await uploadClientDocument({
			clientId: request.clientId,
			uploadUrl: storageUrlForKey(fileKey),
			filename,
			type: 'AGREEMENT',
			adminOnly: true                     // locked: the client can download it but not delete it
		});
		return { clientDocumentUploadId: doc.id };
	}
};

const KINDS: Record<string, SignatureKindDefinition> = {
	[CLIENT_AGREEMENT.kind]: CLIENT_AGREEMENT,
	[HIPAA_BAA.kind]: HIPAA_BAA
};
```

Notes on the fields:
- **`prefill`** — each key must exactly match a Text field's label on the
  template (case aside). A key that doesn't exist **fails the send**: the request
  is marked `FAILED` and admins are emailed. We'd rather fail than deliver a
  document with a blank practice name. If you need a value that isn't on
  `SignatureSubject`, add it in `resolveClientSubject`.
- **`onCompleted`** — runs once, inside a row lock, after the signed PDF is in
  storage. `fileKey` is the private storage key. Store it via
  `storageUrlForKey()` so the download route can find it. Return
  `clientDocumentUploadId` if you filed a client document; that is what shows the
  Download button.
- **`kind`** — a plain string, not a database enum, so adding a kind needs **no
  migration**. Never rename an existing kind, because old rows would stop
  resolving.

### 1.4 Decide what triggers it

**Admin, by hand.** Free: the Agreements panel on the admin client page shows a
**Send <title>** button for every `CLIENT` kind that has no open request.

**Automatically from a business event.** Call `requestSignature` where that
event happens:

```ts
import { requestSignature } from '$lib/server/signatures/service';

// Don't let a Documenso outage break the action that triggered it.
void requestSignature({ kind: 'HIPAA_BAA', subjectId: clientProfile.id }).catch((error) =>
	logger.error('HIPAA BAA not sent', { error, clientId: clientProfile.id })
);
```

- `subjectId` is the **client profile id** for client kinds.
- Pass `actorUserId` when a person triggered the send, so the audit log shows
  who did it.
- `requestSignature` is idempotent: if a request is already open, it returns that
  one with `created: false`.
- See `completeClientOnboarding.ts` for the client agreement trigger.

### 1.5 What you get for free

- The branded "please sign" email, plus an SMS if the subject accepts texts.
- The nudge series: email on days 2, 5, 10, 15, 22 and 29, SMS on days 5, 15 and
  29, then an admin alert on day 30. This is shared by all kinds; see
  `reminders.ts` to change it.
- The countersigner email when the subject signs, and one reminder 3 days later.
- Admin alerts when a document is declined, expires, fails to send, or is
  cancelled from inside Documenso.
- The client sees it in **Settings → Documents → Agreements** (latest request per
  kind) and in a dashboard banner while it's unsigned. Admins see the full
  history and get Nudge now and Cancel buttons.
- An `action_history` audit trail under entity type `SIGNATURE_REQUESTS`.

### 1.6 Test it on staging

1. Send it to a test client from the admin client page. The request should show
   **Sent**. If it shows **Failed**, the panel shows the reason; it's usually a
   label mismatch or a missing env var.
2. Sign it through the emailed link, then countersign it as the second signer.
3. Check that the request reaches **Completed** and the signed PDF downloads from
   the client's Documents.
4. Remember the template is cached for 5 minutes per server process. After
   editing a template, wait 5 minutes or restart the app before re-testing.

---

## 2. Documents for professionals (not built yet)

Only `subjectType: 'CLIENT'` exists today. For the first candidate document:

1. **Types.** Widen `subjectType` in `SignatureKindDefinition` to
   `'CLIENT' | 'CANDIDATE'`, and write a `resolveCandidateSubject` that reads
   `candidate_profiles` and `users`.
2. **Schema.** Add a nullable `candidate_id` FK on `signature_requests`, alongside
   `client_id`, and set it in `requestSignature`. This one **does** need a
   migration: run `npm run generate`, and the user applies it to both databases.
3. **Filing.** In `onCompleted`, insert into `candidate_document_uploads` instead
   (set `locked: true`).
4. **Display.** The candidate signs in the candidate app. Add an
   `api/external/*` endpoint in this app that returns the candidate's requests
   through `toSignatureRequestView()`, and render them in `dtss-candidate-app`.
   The signing link itself works anywhere.
5. **Linking back.** Set `portalUrl` to a candidate-app URL
   (`CANDIDATE_APP_DOMAIN`).

---

## 3. Operations

### Environment variables (admin app)

| Var | Value |
|---|---|
| `DOCUMENSO_API_URL` | `https://<documenso host>/api/v2` |
| `DOCUMENSO_API_KEY` | Team API token (Documenso → Team settings → API Tokens) |
| `DOCUMENSO_WEBHOOK_SECRET` | Shared secret; must match the webhook's |
| `DOCUMENSO_TEMPLATE_<KIND>` | One per kind (see 1.2) |

### Webhook

In Documenso: Team settings → Webhooks →
`https://<admin app>/api/webhooks/documenso`, using the same secret. Subscribe to:
- DOCUMENT_SENT
- DOCUMENT_OPENED
- DOCUMENT_SIGNED
- DOCUMENT_RECIPIENT_COMPLETED
- DOCUMENT_COMPLETED
- DOCUMENT_REJECTED
- DOCUMENT_CANCELLED
- RECIPIENT_EXPIRED

The route bypasses session handling in `hooks.server.ts` and compares
`X-Documenso-Secret` in constant time. Envelopes we didn't create (e.g. sent by
hand from Documenso's UI) are ignored.

### Cron

`processSignatureRequests` runs daily at 11:30 ET (see `jobs/registry.ts`). It
does two things, in this order:
1. Re-syncs every open request, plus completed ones whose PDF hasn't been filed.
2. Sends the due nudges.

Reminders are claimed in `signature_request_reminders` before sending, so a
re-run never sends anything twice.

### Troubleshooting

| Symptom | Look at |
|---|---|
| Request is `FAILED` | `signature_requests.closed_reason`. The usual causes are a prefill label that isn't on the template, a wrong template ID for this environment, or a bad API key. |
| Stuck on `SENT` after the client signed | The webhook isn't reaching us. Check Documenso's webhook log and the secret. The next cron run will catch up anyway. |
| `COMPLETED` but no Download button | `signed_file_key` is null, so filing failed. The cron retries it; check the logs for `signatures:`. |
| Client says they got no email | The audit log has `EMAIL_SENT` rows with the Resend message id. |

### Files

| File | Role |
|---|---|
| `schemas/signature.ts` | Tables and the status enum |
| `signatures/kinds.ts` | **The registry**: the only file most new documents need |
| `signatures/service.ts` | Send, sync, finalize, cancel, webhook entry |
| `signatures/status.ts`, `planning.ts` | Pure logic (unit-tested) |
| `signatures/reminders.ts` | Nudge series |
| `signatures/documensoClient.ts` | API client |
| `signatures/view.ts`, `$lib/signatures/types.ts` | What pages may see (signing links only reach their owner) |
| `routes/api/webhooks/documenso` | Webhook |
| `routes/api/jobs/signatures/processSignatureRequests` | Cron endpoint |
| `routes/api/client-documents/[documentId]/download` | Permission-checked signed-URL download |
