/**
 * E-signature requests through Documenso: send, track, file.
 *
 * Documenso is the source of truth for where an envelope stands. Our row is a
 * cache of that state plus what Documenso can't know (which client it belongs to,
 * where the signed copy was filed). Every state change goes through
 * `syncSignatureRequest`, which re-reads the envelope from the API — webhooks only
 * tell us WHEN to look, so a forged, partial or out-of-order webhook body can't
 * move a request anywhere Documenso doesn't agree with.
 */
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	signatureRequestTable,
	type SignatureCountersigner,
	type SignatureRequest,
	type SignatureRequestStatus
} from '$lib/server/database/schemas/signature';
import { uploadPrivateFile } from '$lib/server/uploads';
import { recordAction } from '$lib/server/audit/audit';
import type { AuditAction, AuditSource } from '$lib/audit/constants';
import { logger } from '$lib/server/logger';
import * as documenso from './documensoClient';
import type { DocumensoEnvelope } from './documensoClient';
import {
	bySigningOrder,
	externalIdFor,
	planTemplateUse,
	requestIdFromExternalId
} from './planning';
import { getSignatureKind, signedFilename, type SignatureSubject } from './kinds';
import { deriveState, isForward, isOpen, OPEN_STATUSES } from './status';

// Imported lazily so this module stays importable by tests without pulling in the
// whole email/SMS stack (same reason as certReminders).
const notifications = () => import('$lib/server/notifications/transactional');

async function audit(
	request: Pick<SignatureRequest, 'id' | 'kind' | 'clientId'>,
	action: AuditAction,
	opts: {
		actor?: string | null;
		source?: AuditSource;
		before?: Record<string, unknown>;
		after?: Record<string, unknown>;
		metadata?: Record<string, unknown>;
	} = {}
) {
	// Never let a ledger write fail a send or a webhook.
	try {
		await recordAction({
			entityType: 'SIGNATURE_REQUESTS',
			entityId: request.id,
			action,
			actor: opts.actor ?? null,
			source: opts.source,
			before: opts.before,
			after: opts.after,
			metadata: { kind: request.kind, clientId: request.clientId, ...(opts.metadata ?? {}) }
		});
	} catch (err) {
		logger.error('signatures: ledger write failed', { error: err, requestId: request.id, action });
	}
}

// ---------- template planning ----------

const TEMPLATE_TTL_MS = 5 * 60 * 1000;
const templateCache = new Map<string, { at: number; envelope: DocumensoEnvelope }>();

async function getTemplate(templateId: string): Promise<DocumensoEnvelope> {
	const hit = templateCache.get(templateId);
	if (hit && Date.now() - hit.at < TEMPLATE_TTL_MS) return hit.envelope;
	const envelope = await documenso.getEnvelope(templateId);
	if (envelope.type !== 'TEMPLATE') {
		throw new Error(`Documenso envelope ${templateId} is not a template`);
	}
	templateCache.set(templateId, { at: Date.now(), envelope });
	return envelope;
}

// ---------- reads ----------

export async function getSignatureRequest(id: string): Promise<SignatureRequest | null> {
	const [row] = await db
		.select()
		.from(signatureRequestTable)
		.where(eq(signatureRequestTable.id, id))
		.limit(1);
	return row ?? null;
}

export async function findOpenSignatureRequest(
	kind: string,
	subjectId: string
): Promise<SignatureRequest | null> {
	const [row] = await db
		.select()
		.from(signatureRequestTable)
		.where(
			and(
				eq(signatureRequestTable.kind, kind),
				eq(signatureRequestTable.subjectId, subjectId),
				inArray(signatureRequestTable.status, [...OPEN_STATUSES])
			)
		)
		.limit(1);
	return row ?? null;
}

/** Newest first. Everything the settings and admin panels show. */
export async function listSignatureRequestsForClient(clientId: string) {
	return db
		.select()
		.from(signatureRequestTable)
		.where(eq(signatureRequestTable.clientId, clientId))
		.orderBy(desc(signatureRequestTable.createdAt));
}

// ---------- send ----------

export type RequestSignatureResult = { request: SignatureRequest; created: boolean };

/**
 * Send `kind` to `subjectId` for signature. Idempotent: if a live request already
 * exists it is returned untouched (created: false).
 *
 * Throws if the document can't be sent; the row is left FAILED and admins are told.
 * Callers that must not fail (onboarding) catch.
 */
export async function requestSignature(args: {
	kind: string;
	subjectId: string;
	actorUserId?: string | null;
}): Promise<RequestSignatureResult> {
	const def = getSignatureKind(args.kind);

	const existing = await findOpenSignatureRequest(def.kind, args.subjectId);
	if (existing) return { request: existing, created: false };

	const templateId = def.templateId();
	if (!templateId) throw new Error(`No Documenso template configured for ${def.kind}`);

	const subject = await def.resolveSubject(args.subjectId);
	if (!subject) throw new Error(`Cannot resolve ${def.subjectType} ${args.subjectId} for ${def.kind}`);

	let row: SignatureRequest;
	try {
		[row] = await db
			.insert(signatureRequestTable)
			.values({
				kind: def.kind,
				subjectType: def.subjectType,
				subjectId: args.subjectId,
				clientId: subject.clientId ?? null,
				recipientUserId: subject.userId,
				recipientEmail: subject.email,
				recipientName: subject.name,
				status: 'PENDING',
				createdBy: args.actorUserId ?? null
			})
			.returning();
	} catch (err) {
		// Lost a race with a concurrent call: the partial unique index fired.
		if ((err as { code?: string })?.code === '23505') {
			const raced = await findOpenSignatureRequest(def.kind, args.subjectId);
			if (raced) return { request: raced, created: false };
		}
		throw err;
	}

	try {
		const template = await getTemplate(templateId);
		const plan = planTemplateUse(template, def.prefill(subject));
		const sent = await documenso.createFromTemplate({
			templateId,
			externalId: externalIdFor(row.id),
			recipients: [
				{ id: plan.subjectTemplateRecipientId, email: subject.email, name: subject.name }
			],
			prefillFields: plan.prefillFields,
			title: `${def.title} - ${subject.displayName}`,
			redirectUrl: def.portalUrl()
		});

		const signers = sent.recipients.filter((r) => r.role === 'SIGNER').sort(bySigningOrder);
		const subjectRecipient = signers[0];
		if (!subjectRecipient?.signingUrl) throw new Error('Documenso returned no signing link');
		const countersigners: SignatureCountersigner[] = signers.slice(1).map((r) => ({
			documensoRecipientId: r.id,
			name: r.name,
			email: r.email,
			signingUrl: r.signingUrl,
			signingOrder: r.signingOrder
		}));

		[row] = await db
			.update(signatureRequestTable)
			.set({
				status: 'SENT',
				sentAt: new Date(),
				documensoEnvelopeId: sent.id,
				documensoRecipientId: subjectRecipient.id,
				signingUrl: subjectRecipient.signingUrl,
				countersigners,
				updatedAt: new Date()
			})
			.where(eq(signatureRequestTable.id, row.id))
			.returning();
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		await db
			.update(signatureRequestTable)
			.set({ status: 'FAILED', closedAt: new Date(), closedReason: reason.slice(0, 500), updatedAt: new Date() })
			.where(eq(signatureRequestTable.id, row.id));
		logger.error('signatures: send failed', {
			error: err,
			requestId: row.id,
			kind: def.kind,
			subjectId: args.subjectId,
			...(err instanceof documenso.DocumensoError && { status: err.status, body: err.body })
		});
		await audit(row, 'STATUS_CHANGE', {
			actor: args.actorUserId,
			after: { status: 'FAILED' },
			metadata: { reason }
		});
		const { notifyAdminsSignatureAlert } = await notifications();
		await notifyAdminsSignatureAlert({
			clientId: row.clientId,
			organisationName: subject.displayName,
			documentTitle: def.title,
			headline: 'Could not send document for signature',
			detail: reason
		});
		throw err;
	}

	await audit(row, 'CREATE', {
		actor: args.actorUserId,
		after: { status: row.status, envelopeId: row.documensoEnvelopeId }
	});
	await sendSigningInvite(row, subject);
	return { request: row, created: true };
}

async function sendSigningInvite(row: SignatureRequest, subject: SignatureSubject) {
	if (!row.signingUrl) return;
	const def = getSignatureKind(row.kind);
	const { notifySignatureRequested } = await notifications();
	await notifySignatureRequested({
		subject,
		documentTitle: def.title,
		signingUrl: row.signingUrl,
		portalUrl: def.portalUrl(),
		auditEntityId: row.id
	});
}

/** Admin "nudge now": re-send the invite for a live request outside the cron series. */
export async function resendSigningInvite(requestId: string, actorUserId: string) {
	const row = await getSignatureRequest(requestId);
	if (!row || !isOpen(row.status)) throw new Error('Request is not awaiting a signature');
	const def = getSignatureKind(row.kind);

	if (row.status === 'AWAITING_COUNTERSIGN') {
		const subject = await def.resolveSubject(row.subjectId);
		const { notifySignatureCountersign } = await notifications();
		await notifySignatureCountersign({
			countersigners: row.countersigners,
			documentTitle: def.title,
			organisationName: subject?.displayName ?? row.recipientName,
			reminder: true,
			auditEntityId: row.id
		});
	} else {
		const subject = await def.resolveSubject(row.subjectId);
		if (!subject) throw new Error('Subject no longer exists');
		await sendSigningInvite(row, subject);
	}
	await audit(row, 'REMIND', { actor: actorUserId });
}

// ---------- cancel ----------

export async function cancelSignatureRequest(args: {
	requestId: string;
	actorUserId: string;
	reason?: string;
}): Promise<SignatureRequest> {
	const row = await getSignatureRequest(args.requestId);
	if (!row) throw new Error('Signature request not found');
	if (!isOpen(row.status)) return row;

	if (row.documensoEnvelopeId) {
		try {
			await documenso.cancelEnvelope(row.documensoEnvelopeId, args.reason);
		} catch (err) {
			// Most likely it completed or was rejected in the meantime: let Documenso's
			// state win rather than cancelling a signed agreement locally.
			logger.error('signatures: cancel failed, syncing instead', { error: err, requestId: row.id });
			return syncSignatureRequest(row);
		}
	}

	const [updated] = await db
		.update(signatureRequestTable)
		.set({
			status: 'CANCELLED',
			closedAt: new Date(),
			closedReason: args.reason || 'Cancelled by admin',
			updatedAt: new Date()
		})
		.where(and(eq(signatureRequestTable.id, row.id), eq(signatureRequestTable.status, row.status)))
		.returning();
	await audit(row, 'CANCEL', {
		actor: args.actorUserId,
		before: { status: row.status },
		after: { status: 'CANCELLED' },
		metadata: { reason: args.reason ?? null }
	});
	return updated ?? (await getSignatureRequest(row.id))!;
}

// ---------- sync ----------

/**
 * Bring one request in line with Documenso and run the side effects of whatever
 * transition that is. Safe to call any number of times, concurrently: the status
 * update is conditional on the status we read, so exactly one caller wins each
 * transition and only the winner notifies anyone.
 */
export async function syncSignatureRequest(
	row: SignatureRequest,
	opts: { source?: AuditSource } = {}
): Promise<SignatureRequest> {
	if (!row.documensoEnvelopeId) return row;

	const envelope = await documenso.getEnvelope(row.documensoEnvelopeId);
	const derived = deriveState(envelope, row.documensoRecipientId);
	let current = row;

	if (isForward(row.status, derived.status)) {
		const terminal = !isOpen(derived.status) && derived.status !== 'COMPLETED';
		const [updated] = await db
			.update(signatureRequestTable)
			.set({
				status: derived.status,
				openedAt: row.openedAt ?? derived.openedAt ?? derived.subjectSignedAt ?? null,
				subjectSignedAt: row.subjectSignedAt ?? derived.subjectSignedAt ?? null,
				completedAt: derived.completedAt ?? row.completedAt,
				...(terminal && { closedAt: new Date(), closedReason: derived.closedReason ?? null }),
				updatedAt: new Date()
			})
			.where(and(eq(signatureRequestTable.id, row.id), eq(signatureRequestTable.status, row.status)))
			.returning();

		if (!updated) {
			// Someone else applied a transition first; theirs ran the side effects.
			return (await getSignatureRequest(row.id)) ?? row;
		}
		current = updated;
		await audit(current, 'STATUS_CHANGE', {
			source: opts.source,
			before: { status: row.status },
			after: { status: current.status },
			metadata: derived.closedReason ? { reason: derived.closedReason } : undefined
		});
		await onTransition(row.status, current);
	}

	if (current.status === 'COMPLETED' && !current.signedFileKey) {
		current = await finalizeCompleted(current, envelope);
	}
	return current;
}

async function onTransition(from: SignatureRequestStatus, row: SignatureRequest) {
	const def = getSignatureKind(row.kind);
	const { notifySignatureCountersign, notifyAdminsSignatureAlert } = await notifications();

	if (row.status === 'AWAITING_COUNTERSIGN' && row.countersigners.length > 0) {
		const subject = await def.resolveSubject(row.subjectId);
		await notifySignatureCountersign({
			countersigners: row.countersigners,
			documentTitle: def.title,
			organisationName: subject?.displayName ?? row.recipientName,
			reminder: false,
			auditEntityId: row.id
		});
		return;
	}

	if (row.status === 'REJECTED' || row.status === 'EXPIRED' || row.status === 'CANCELLED') {
		const subject = await def.resolveSubject(row.subjectId);
		await notifyAdminsSignatureAlert({
			clientId: row.clientId,
			organisationName: subject?.displayName ?? row.recipientName,
			documentTitle: def.title,
			headline:
				row.status === 'REJECTED'
					? 'Document declined'
					: row.status === 'EXPIRED'
						? 'Signing link expired'
						: 'Document cancelled in Documenso',
			detail: `${row.recipientName} <${row.recipientEmail}> — ${row.closedReason ?? 'no reason given'} (was ${from}).`
		});
	}
}

/**
 * Copy the signed PDF into our storage and file it where the kind says. Runs once
 * per request: concurrent callers are serialised on the row lock and the second
 * one sees `signed_file_key` already set.
 */
async function finalizeCompleted(
	row: SignatureRequest,
	envelope?: DocumensoEnvelope
): Promise<SignatureRequest> {
	const def = getSignatureKind(row.kind);
	const env = envelope ?? (await documenso.getEnvelope(row.documensoEnvelopeId!));
	const item = [...env.envelopeItems].sort((a, b) => a.order - b.order)[0];
	if (!item) throw new Error(`Envelope ${env.id} has no items`);

	const pdf = await documenso.downloadSignedItem(item.id);
	const subject = await def.resolveSubject(row.subjectId);
	const displayName = subject?.displayName ?? row.recipientName;
	const filename = signedFilename(def, { displayName }, row.completedAt ?? new Date());

	// Deterministic key: a retried finalize overwrites its own earlier upload.
	const fileKey = await uploadPrivateFile({
		file: { mimetype: 'application/pdf', fileName: `${row.id}.pdf`, buffer: pdf },
		location: `signed-documents/${def.kind.toLowerCase()}/${row.subjectId}`
	});

	const finalized = await db.transaction(async (tx) => {
		const [locked] = await tx
			.select()
			.from(signatureRequestTable)
			.where(eq(signatureRequestTable.id, row.id))
			.for('update');
		if (!locked || locked.signedFileKey) return null;

		const filed = await def.onCompleted({ request: locked, fileKey, filename });
		const [updated] = await tx
			.update(signatureRequestTable)
			.set({
				signedFileKey: fileKey,
				clientDocumentUploadId: filed.clientDocumentUploadId ?? null,
				updatedAt: new Date()
			})
			.where(eq(signatureRequestTable.id, row.id))
			.returning();
		return updated;
	});

	if (!finalized) return (await getSignatureRequest(row.id)) ?? row;

	await audit(finalized, 'UPDATE', {
		after: { signedFileKey: fileKey, clientDocumentUploadId: finalized.clientDocumentUploadId },
		metadata: { event: 'signed_copy_filed' }
	});
	const { notifySignatureCompleted } = await notifications();
	await notifySignatureCompleted({
		subject: {
			email: finalized.recipientEmail,
			firstName: subject?.firstName ?? null,
			displayName
		},
		documentTitle: def.title,
		portalUrl: def.portalUrl(),
		auditEntityId: finalized.id
	});
	return finalized;
}

/** Webhook entry point: find our request for an envelope event and sync it. */
export async function handleDocumensoEvent(body: {
	event?: string;
	payload?: { id?: string | number; envelopeId?: string; externalId?: string | null };
}): Promise<{ matched: boolean; requestId?: string; status?: SignatureRequestStatus }> {
	const p = body.payload ?? {};
	let row: SignatureRequest | null = null;

	const fromExternal = requestIdFromExternalId(p.externalId);
	if (fromExternal) row = await getSignatureRequest(fromExternal);

	if (!row) {
		const envelopeIds = [p.envelopeId, typeof p.id === 'string' ? p.id : undefined].filter(
			(v): v is string => Boolean(v)
		);
		if (envelopeIds.length > 0) {
			[row] = await db
				.select()
				.from(signatureRequestTable)
				.where(inArray(signatureRequestTable.documensoEnvelopeId, envelopeIds))
				.limit(1);
		}
	}

	// Documents sent by hand from the Documenso UI aren't ours to track.
	if (!row) return { matched: false };

	const synced = await syncSignatureRequest(row, { source: 'DOCUMENSO' });
	return { matched: true, requestId: synced.id, status: synced.status };
}

/**
 * Reconciliation sweep: everything still open, plus completed requests whose
 * signed copy hasn't been filed. Catches missed webhooks and failed finalizes.
 */
export async function reconcileSignatureRequests(): Promise<{
	checked: number;
	changed: number;
	failures: number;
}> {
	const rows = await db
		.select()
		.from(signatureRequestTable)
		.where(
			and(
				isNotNull(signatureRequestTable.documensoEnvelopeId),
				inArray(signatureRequestTable.status, ['SENT', 'OPENED', 'AWAITING_COUNTERSIGN', 'COMPLETED'])
			)
		)
		.orderBy(asc(signatureRequestTable.createdAt));

	let checked = 0;
	let changed = 0;
	let failures = 0;
	for (const row of rows) {
		if (row.status === 'COMPLETED' && row.signedFileKey) continue;
		checked++;
		try {
			const after = await syncSignatureRequest(row, { source: 'CRON' });
			if (after.status !== row.status || after.signedFileKey !== row.signedFileKey) changed++;
		} catch (err) {
			failures++;
			logger.error('signatures: reconcile failed', { error: err, requestId: row.id });
		}
	}
	return { checked, changed, failures };
}

