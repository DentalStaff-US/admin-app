/**
 * Pure status logic for signature requests. No database, no network — the service
 * feeds it Documenso's view of an envelope and applies what comes back.
 */
import type { SignatureRequestStatus } from '$lib/server/database/schemas/signature';
import type { DocumensoEnvelope } from './documensoClient';

/** Statuses a signer can still act on. Mirrors the partial unique index. */
export const OPEN_STATUSES = ['PENDING', 'SENT', 'OPENED', 'AWAITING_COUNTERSIGN'] as const;

export function isOpen(status: SignatureRequestStatus): boolean {
	return (OPEN_STATUSES as readonly string[]).includes(status);
}

/**
 * Forward-only ordering. Webhooks and the reconciliation sweep both report state,
 * possibly late and possibly twice, so a transition is applied only if it moves
 * further along. All terminal states share the top rank: once closed, nothing
 * reopens a request (a new request is sent instead).
 */
const STATUS_RANK: Record<SignatureRequestStatus, number> = {
	PENDING: 0,
	SENT: 1,
	OPENED: 2,
	AWAITING_COUNTERSIGN: 3,
	COMPLETED: 10,
	REJECTED: 10,
	CANCELLED: 10,
	EXPIRED: 10,
	FAILED: 10
};

export function isForward(from: SignatureRequestStatus, to: SignatureRequestStatus): boolean {
	return STATUS_RANK[to] > STATUS_RANK[from];
}

export type DerivedState = {
	status: SignatureRequestStatus;
	openedAt?: Date;
	subjectSignedAt?: Date;
	completedAt?: Date;
	closedReason?: string;
};

/**
 * Where the request stands according to Documenso.
 *
 * `subjectRecipientId` is the subject's recipient on THIS envelope (Documenso gives
 * every envelope fresh recipient ids, so it is stored per request, not taken from
 * the template).
 */
export function deriveState(
	envelope: Pick<DocumensoEnvelope, 'status' | 'completedAt' | 'recipients'>,
	subjectRecipientId: number | null
): DerivedState {
	const subject = envelope.recipients.find((r) => r.id === subjectRecipientId);

	if (envelope.status === 'COMPLETED') {
		return {
			status: 'COMPLETED',
			completedAt: envelope.completedAt ? new Date(envelope.completedAt) : new Date(),
			...(subject?.signedAt && { subjectSignedAt: new Date(subject.signedAt) })
		};
	}
	if (envelope.status === 'REJECTED') {
		const rejecter = envelope.recipients.find((r) => r.signingStatus === 'REJECTED');
		return {
			status: 'REJECTED',
			closedReason: rejecter?.rejectionReason || 'Declined to sign'
		};
	}
	if (envelope.status === 'CANCELLED') {
		return { status: 'CANCELLED', closedReason: 'Cancelled in Documenso' };
	}
	if (envelope.status !== 'PENDING') {
		// DRAFT: created but never distributed. Treat as not yet sent.
		return { status: 'PENDING' };
	}

	if (subject?.signingStatus === 'SIGNED') {
		return {
			status: 'AWAITING_COUNTERSIGN',
			subjectSignedAt: subject.signedAt ? new Date(subject.signedAt) : new Date()
		};
	}
	// Expiry is per recipient. Only the subject's matters: a countersigner's link
	// cannot expire before the subject has signed in a sequential envelope.
	if (subject?.expired) {
		return { status: 'EXPIRED', closedReason: 'Signing link expired' };
	}
	if (subject?.readStatus === 'OPENED') {
		return { status: 'OPENED', openedAt: new Date() };
	}
	return { status: 'SENT' };
}
