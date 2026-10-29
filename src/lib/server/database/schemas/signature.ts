import { pgTable, text, timestamp, pgEnum, uuid, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userTable } from './auth';
import { clientDocumentUploadsTable, clientProfileTable } from './client';

/**
 * Lifecycle of one e-signature request (one Documenso envelope).
 *
 *   PENDING ─► SENT ─► OPENED ─► AWAITING_COUNTERSIGN ─► COMPLETED
 *                 └──────┴──────────────┴─► REJECTED | CANCELLED | EXPIRED
 *   PENDING ─► FAILED   (Documenso call failed; never reached a signer)
 *
 * PENDING exists only between our insert and Documenso's reply. Status only ever
 * moves forward (see `STATUS_RANK` in signatures/status.ts) because webhooks and
 * the reconciliation sweep can deliver the same transition twice, in any order.
 */
export const signatureRequestStatusEnum = pgEnum('signature_request_status', [
	'PENDING',
	'SENT',
	'OPENED',
	'AWAITING_COUNTERSIGN',
	'COMPLETED',
	'REJECTED',
	'CANCELLED',
	'EXPIRED',
	'FAILED'
]);

/** A countersigner as Documenso returned it when the envelope was created. */
export type SignatureCountersigner = {
	documensoRecipientId: number;
	name: string;
	email: string;
	signingUrl: string;
	signingOrder: number;
};

/**
 * One row per document sent for signature through Documenso.
 *
 * `kind` is plain text, not an enum, so adding a new document type is a registry
 * entry in src/lib/server/signatures/kinds.ts rather than a migration.
 *
 * The subject is who the document is ABOUT and who signs first (a client today; a
 * professional later). `subject_type`/`subject_id` are the generic handle the
 * service works with; `client_id` is the typed FK for the client case so a deleted
 * client takes its requests with it and queries can join without casting.
 */
export const signatureRequestTable = pgTable(
	'signature_requests',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),

		kind: text('kind').notNull(),
		subjectType: text('subject_type').notNull(),
		subjectId: text('subject_id').notNull(),
		clientId: text('client_id').references(() => clientProfileTable.id, { onDelete: 'cascade' }),

		// The person signing on the subject's behalf, as of sending.
		recipientUserId: text('recipient_user_id').references(() => userTable.id, {
			onDelete: 'set null'
		}),
		recipientEmail: text('recipient_email').notNull(),
		recipientName: text('recipient_name').notNull(),

		documensoEnvelopeId: text('documenso_envelope_id').unique(),
		documensoRecipientId: integer('documenso_recipient_id'),
		// The subject's personal signing link on Documenso. Shown in settings and every
		// nudge; valid until the envelope completes, is cancelled or expires.
		signingUrl: text('signing_url'),
		countersigners: jsonb('countersigners').$type<SignatureCountersigner[]>().notNull().default([]),

		status: signatureRequestStatusEnum('status').notNull().default('PENDING'),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
		openedAt: timestamp('opened_at', { withTimezone: true, mode: 'date' }),
		subjectSignedAt: timestamp('subject_signed_at', { withTimezone: true, mode: 'date' }),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
		closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
		closedReason: text('closed_reason'),

		// Set once the signed PDF is in our storage and the kind's onCompleted ran.
		// COMPLETED with this still null = finalize pending; the sweep retries it.
		signedFileKey: text('signed_file_key'),
		clientDocumentUploadId: uuid('client_document_upload_id').references(
			() => clientDocumentUploadsTable.id,
			{ onDelete: 'set null' }
		),

		// The 30-day nudge series ran out without a signature; admins were told.
		nudgesExhaustedAt: timestamp('nudges_exhausted_at', { withTimezone: true, mode: 'date' }),

		// Null = sent by the system (onboarding completion), otherwise the admin.
		createdBy: text('created_by').references(() => userTable.id, { onDelete: 'set null' })
	},
	(t) => ({
		// At most one live request per document per subject. This is what makes
		// requestSignature safe to call twice (double-submit, retried onboarding).
		openPerSubject: uniqueIndex('signature_requests_open_per_subject_idx')
			.on(t.kind, t.subjectId)
			.where(sql`status in ('PENDING', 'SENT', 'OPENED', 'AWAITING_COUNTERSIGN')`),
		byClient: index('signature_requests_client_idx').on(t.clientId, t.createdAt),
		byStatus: index('signature_requests_status_idx').on(t.status)
	})
);

/**
 * One row per signature nudge actually sent. Same claim-then-send mechanism as
 * candidate_cert_reminders: the unique (request_id, stage) is claimed BEFORE
 * sending, so a repeated or concurrent cron run is a no-op rather than a double
 * SMS.
 */
export const signatureRequestReminderTable = pgTable(
	'signature_request_reminders',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		requestId: uuid('request_id')
			.notNull()
			.references(() => signatureRequestTable.id, { onDelete: 'cascade' }),
		stage: text('stage').notNull(),
		channels: text('channels').notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(t) => ({
		oncePerStage: uniqueIndex('signature_request_reminders_stage_idx').on(t.requestId, t.stage)
	})
);

export type SignatureRequest = typeof signatureRequestTable.$inferSelect;
export type NewSignatureRequest = typeof signatureRequestTable.$inferInsert;
export type SignatureRequestStatus = (typeof signatureRequestStatusEnum.enumValues)[number];
