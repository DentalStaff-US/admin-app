import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { CANDIDATE_STATUS } from '$lib/config/constants';

/**
 * "This professional's record is frozen because they are live on the platform."
 *
 * Approval is the point at which practices and compliance start relying on what is
 * on file, so the editable set narrows. Hoisted out of the two inline copies that
 * used to express this, because §-level rules (documents, and now Experience &
 * Rates) must agree on what "approved" means.
 *
 * `approved` and `status` are kept in sync by the admin updateStatus action, so
 * either alone would do; checking both costs nothing and survives a drift.
 */
export function isCandidateFrozen(profile: {
	approved?: boolean | null;
	status?: string | null;
}): boolean {
	return profile.approved === true || profile.status === CANDIDATE_STATUS.ACTIVE;
}

export type DocumentEditDecision =
	| { allowed: true }
	| { allowed: false; reason: 'NOT_FOUND' | 'NOT_OWNER' | 'APPROVED' | 'LOCKED'; message: string };

/**
 * Credential metadata a professional may correct even after approval. These describe
 * the credential; they do not replace the verified artifact, and the gate keys off
 * both of them — refusing to let someone fix a mistyped expiry date while their job
 * visibility depends on it is indefensible.
 *
 * A wrong `disciplineId` is the same class of mistake: a certificate attached to the
 * wrong Experience & Rates entry silently proves nothing.
 */
export const CREDENTIAL_METADATA_FIELDS = ['expiryDate', 'disciplineId'] as const;

/** Types a DESIGNATE_CREDENTIAL intent may set. Never away from these. */
const DESIGNATABLE_TYPES = ['LICENSE', 'CERTIFICATE'] as const;

/**
 * Single rule for "may this professional change this document?".
 *
 * A candidate may edit (retype, replace, delete) their own document unless:
 *   - an admin has locked that specific document (`locked` / `adminOnly`), or
 *   - the account has been APPROVED — approved credentials are what practices and
 *     compliance rely on, so the set freezes at approval.
 *
 * Both freezes are deliberate and separate: approval freezes everything, while
 * `locked` pins one document without freezing the rest. Admins bypass this
 * entirely — it governs candidate-initiated edits only.
 *
 * TWO NARROW EXCEPTIONS to the approval freeze, both for credential upkeep:
 *
 *   1. `fields` — when every field being written is in CREDENTIAL_METADATA_FIELDS,
 *      the approval freeze does not apply. Renewal itself never needs this (it is a
 *      new upload, and `createCandidateDocument` is not guarded), but correcting a
 *      typo does.
 *   2. `intent: 'DESIGNATE_CREDENTIAL'` — additionally permits setting `type` to
 *      LICENSE or CERTIFICATE, as one atomic operation with a discipline link and an
 *      expiry. This exists for the legacy population: uploads used to be forced to
 *      type OTHER, so hundreds of working professionals must be able to designate an
 *      existing file as a credential without re-uploading it. A general post-approval
 *      `type` edit stays frozen — that would let someone retype a vetted agreement.
 *
 * The per-document `locked`/`adminOnly` pin outranks both exceptions, which is why it
 * is evaluated BEFORE them.
 *
 * Centralised so the upload, retype and delete paths cannot drift apart; a gap in any
 * one of them would let an approved candidate swap a verified document.
 */
export async function assertCandidateDocumentEditable(opts: {
	documentId: string;
	/** candidate_profiles.id of the requester. */
	candidateId: string;
	/**
	 * The fields this write touches. Omit for the original all-or-nothing behaviour
	 * (replace, delete), which is what every existing caller gets.
	 */
	fields?: readonly string[];
	/** See exception 2 above. */
	intent?: 'DESIGNATE_CREDENTIAL';
	/** The type being written, when `intent` is DESIGNATE_CREDENTIAL. */
	nextType?: string | null;
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

	// Evaluated BEFORE the approval carve-outs below: an admin-pinned document stays
	// pinned even for a credential-metadata edit.
	if (row.locked || row.adminOnly) {
		return {
			allowed: false,
			reason: 'LOCKED',
			message: 'This document has been locked by an administrator and cannot be changed.'
		};
	}

	const approved = isCandidateFrozen(row);

	if (approved) {
		const touched = opts.fields ?? [];
		const metadataOnly =
			touched.length > 0 &&
			touched.every((f) => (CREDENTIAL_METADATA_FIELDS as readonly string[]).includes(f));

		// Exception 2: designation may also set `type`, but only to a credential type
		// and only alongside the metadata fields.
		const designating =
			opts.intent === 'DESIGNATE_CREDENTIAL' &&
			touched.length > 0 &&
			touched.every(
				(f) => f === 'type' || (CREDENTIAL_METADATA_FIELDS as readonly string[]).includes(f)
			) &&
			(!touched.includes('type') ||
				(!!opts.nextType && (DESIGNATABLE_TYPES as readonly string[]).includes(opts.nextType)));

		if (!metadataOnly && !designating) {
			return {
				allowed: false,
				reason: 'APPROVED',
				message:
					'Your account has been approved, so your documents are locked. Contact support if something needs to change.'
			};
		}
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
	/**
	 * Whether credential metadata (expiry, discipline link) may still be corrected.
	 * Always true at this level — the approval freeze does not cover it — so the
	 * settings page can render those cells editable while the type cell and Delete
	 * stay locked. A per-document `locked`/`adminOnly` pin still wins, which the page
	 * checks per row.
	 */
	canEditCredentialMetadata: boolean;
}> {
	const [profile] = await db
		.select({ status: candidateProfileTable.status, approved: candidateProfileTable.approved })
		.from(candidateProfileTable)
		.where(eq(candidateProfileTable.id, candidateId))
		.limit(1);

	if (!profile) return { editable: false, reason: null, canEditCredentialMetadata: false };

	const frozen = isCandidateFrozen(profile);
	return {
		editable: !frozen,
		reason: frozen ? 'APPROVED' : null,
		canEditCredentialMetadata: true
	};
}
