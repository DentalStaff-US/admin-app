import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { CANDIDATE_STATUS } from '$lib/config/constants';

export type DocumentEditDecision =
	| { allowed: true }
	| { allowed: false; reason: 'NOT_FOUND' | 'NOT_OWNER' | 'APPROVED' | 'LOCKED'; message: string };

/**
 * Single rule for "may this professional change this document?".
 *
 * A candidate may edit (retype, replace, delete) their own document unless:
 *   - the account has been APPROVED — approved credentials are what practices
 *     and compliance rely on, so the set freezes at approval; or
 *   - an admin has locked that specific document.
 *
 * Both freezes are deliberate and separate: approval freezes everything, while
 * `locked` lets an admin pin one document without freezing the rest. Admins
 * bypass this entirely — it governs candidate-initiated edits only.
 *
 * Centralised so the upload, retype and delete paths cannot drift apart; a gap
 * in any one of them would let an approved candidate swap a verified document.
 */
export async function assertCandidateDocumentEditable(opts: {
	documentId: string;
	/** candidate_profiles.id of the requester. */
	candidateId: string;
}): Promise<DocumentEditDecision> {
	const [row] = await db
		.select({
			id: candidateDocumentUploadsTable.id,
			ownerId: candidateDocumentUploadsTable.candidateId,
			locked: candidateDocumentUploadsTable.locked,
			adminOnly: candidateDocumentUploadsTable.adminOnly,
			status: candidateProfileTable.status,
			approved: candidateProfileTable.approved
		})
		.from(candidateDocumentUploadsTable)
		.innerJoin(
			candidateProfileTable,
			eq(candidateDocumentUploadsTable.candidateId, candidateProfileTable.id)
		)
		.where(eq(candidateDocumentUploadsTable.id, opts.documentId))
		.limit(1);

	if (!row) {
		return { allowed: false, reason: 'NOT_FOUND', message: 'Document not found.' };
	}

	if (row.ownerId !== opts.candidateId) {
		// Same message as NOT_FOUND to avoid confirming another candidate's
		// document id exists.
		return { allowed: false, reason: 'NOT_OWNER', message: 'Document not found.' };
	}

	if (row.approved === true || row.status === CANDIDATE_STATUS.ACTIVE) {
		return {
			allowed: false,
			reason: 'APPROVED',
			message:
				'Your account has been approved, so your documents are locked. Contact support if something needs to change.'
		};
	}

	if (row.locked || row.adminOnly) {
		return {
			allowed: false,
			reason: 'LOCKED',
			message: 'This document has been locked by an administrator and cannot be changed.'
		};
	}

	return { allowed: true };
}

/**
 * Whether this candidate's documents are editable at all, for rendering the
 * settings page in a read-only state rather than letting the user try and fail.
 */
export async function getCandidateDocumentEditability(candidateId: string): Promise<{
	editable: boolean;
	reason: 'APPROVED' | null;
}> {
	const [profile] = await db
		.select({ status: candidateProfileTable.status, approved: candidateProfileTable.approved })
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, candidateId))
		.limit(1);

	if (!profile) return { editable: false, reason: null };

	const frozen = profile.approved === true || profile.status === CANDIDATE_STATUS.ACTIVE;
	return { editable: !frozen, reason: frozen ? 'APPROVED' : null };
}
