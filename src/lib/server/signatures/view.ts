/**
 * What pages get to see of a signature request. Server-only shaping so the signing
 * link — a bearer credential for someone else's signature — only ever reaches the
 * person it belongs to (or an admin).
 */
import type { SignatureRequest } from '$lib/server/database/schemas/signature';
import { getSignatureKind } from './kinds';
import { isOpen } from './status';
import { listSignatureRequestsForClient } from './service';
import type { SignatureRequestView } from '$lib/signatures/types';

export function toSignatureRequestView(
	row: SignatureRequest,
	viewer: { userId: string; isAdmin: boolean }
): SignatureRequestView {
	const canSign =
		(row.status === 'SENT' || row.status === 'OPENED') &&
		(viewer.isAdmin || viewer.userId === row.recipientUserId);
	return {
		id: row.id,
		kind: row.kind,
		title: getSignatureKind(row.kind).title,
		status: row.status,
		open: isOpen(row.status),
		recipientName: row.recipientName,
		recipientEmail: row.recipientEmail,
		sentAt: row.sentAt,
		subjectSignedAt: row.subjectSignedAt,
		completedAt: row.completedAt,
		closedAt: row.closedAt,
		closedReason: row.closedReason,
		nudgesExhaustedAt: row.nudgesExhaustedAt,
		signingUrl: canSign ? row.signingUrl : null,
		countersignerNames: row.countersigners.map((c) => c.name),
		clientDocumentUploadId: row.clientDocumentUploadId,
		documensoEnvelopeId: viewer.isAdmin ? row.documensoEnvelopeId : null
	};
}

export async function getClientSignatureViews(
	clientId: string | null | undefined,
	viewer: { userId: string; isAdmin: boolean }
): Promise<SignatureRequestView[]> {
	if (!clientId) return [];
	const rows = await listSignatureRequestsForClient(clientId);
	return rows.map((r) => toSignatureRequestView(r, viewer));
}

/**
 * The client-facing list: the latest request per document, not the full history
 * (an admin cancel-and-resend leaves a CANCELLED row behind that the client never
 * needs to see). Admins get every row.
 */
export function latestPerKind(views: SignatureRequestView[]): SignatureRequestView[] {
	const seen = new Set<string>();
	return views.filter((v) => (seen.has(v.kind) ? false : (seen.add(v.kind), true)));
}
