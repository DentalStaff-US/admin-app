/**
 * Write-side rules for linking a credential document to a professional's
 * Experience & Rates entry.
 *
 * This is the integrity layer that stands in for a composite foreign key: a
 * `(candidate_id, discipline_id)` FK to candidate_discipline_experience would be the
 * honest constraint, but `ON DELETE SET NULL` on it would try to null
 * `candidate_id`, which is NOT NULL. (Postgres 15+ can express
 * `ON DELETE SET NULL (discipline_id)`, but depending on that for a rule we check
 * here anyway is a version trap.) So `discipline_id` carries only a plain FK to
 * `disciplines`, and "the professional actually holds this discipline" is enforced
 * by `assertDisciplineHeldByCandidate` on every write path.
 */

import { and, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateDisciplineExperienceTable } from '$lib/server/database/schemas/candidate';
import { LINKABLE_CREDENTIAL_TYPES } from './credentialStatus';

export type CredentialLinkDecision =
	| { ok: true }
	| { ok: false; reason: 'NOT_HELD' | 'NOT_A_CREDENTIAL' | 'EXPIRY_REQUIRED'; message: string };

/** Narrowing guard for the document types that may carry a discipline link. */
export function isCredentialType(type: string | null | undefined): boolean {
	return !!type && (LINKABLE_CREDENTIAL_TYPES as readonly string[]).includes(type);
}

/**
 * A credential may only be attached to a discipline the professional holds.
 * Without this, a stray `discipline_id` would be invisible to the gate (which joins
 * on the pair) while still appearing in the UI as though it proved something.
 */
export async function assertDisciplineHeldByCandidate(
	candidateId: string,
	disciplineId: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any = db
): Promise<boolean> {
	const [row] = await tx
		.select({ disciplineId: candidateDisciplineExperienceTable.disciplineId })
		.from(candidateDisciplineExperienceTable)
		.where(
			and(
				eq(candidateDisciplineExperienceTable.candidateId, candidateId),
				eq(candidateDisciplineExperienceTable.disciplineId, disciplineId)
			)
		)
		.limit(1);
	return !!row;
}

/**
 * Full validation for a link write. Enforces the three rules that keep the derived
 * model coherent:
 *   1. only LICENSE/CERTIFICATE may be linked (an AGREEMENT with an expiry must
 *      never gate placement);
 *   2. the professional must hold the discipline;
 *   3. a linked credential must carry an expiry — a link with no date tracks
 *      nothing and is the one genuinely confusing half-state.
 */
export async function validateCredentialLink(
	opts: {
		candidateId: string;
		disciplineId: string | null | undefined;
		type: string | null | undefined;
		expiryDate: string | Date | null | undefined;
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any = db
): Promise<CredentialLinkDecision> {
	// Not a link at all — nothing to validate.
	if (!opts.disciplineId) return { ok: true };

	if (!isCredentialType(opts.type)) {
		return {
			ok: false,
			reason: 'NOT_A_CREDENTIAL',
			message: 'Only a License or Certification can be linked to a discipline.'
		};
	}

	if (!opts.expiryDate) {
		return {
			ok: false,
			reason: 'EXPIRY_REQUIRED',
			message: 'An expiration date is required when linking a credential to a discipline.'
		};
	}

	if (!(await assertDisciplineHeldByCandidate(opts.candidateId, opts.disciplineId, tx))) {
		return {
			ok: false,
			reason: 'NOT_HELD',
			message: 'You do not have that discipline on your profile.'
		};
	}

	return { ok: true };
}

/**
 * Normalise a credential expiry to the 'YYYY-MM-DD' the column stores.
 *
 * `candidate_document_uploads.expiry_date` is a `date` (migration 0060). Accepts the
 * bare date an `<input type="date">` submits, and a full ISO datetime for callers
 * that still send one — a Date is read in UTC, matching how the pre-0060 values were
 * written, so nothing shifts a day.
 *
 * Returns null for empty or unparseable input rather than an Invalid Date, so a bad
 * value cannot reach the database as a silent null-equivalent.
 */
export function toCredentialExpiryDate(value: string | Date | null | undefined): string | null {
	if (!value) return null;
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' from a stored expiry, for display and for CertInput.effectiveExpiry. */
export function credentialExpiryToISODate(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	if (typeof value === 'string') return value.slice(0, 10);
	return value.toISOString().slice(0, 10);
}

/**
 * The S3/Spaces object key for a stored document URL.
 *
 * `uploadFile` returns a public CDN URL, so the key is everything after the host.
 * Needed to re-sign a short-lived download link instead of handing a practice the
 * permanent public URL (see the workday credential panel).
 */
export function uploadUrlToKey(uploadUrl: string | null | undefined): string | null {
	if (!uploadUrl) return null;
	try {
		const { pathname } = new URL(uploadUrl);
		const key = decodeURIComponent(pathname.replace(/^\/+/, ''));
		return key || null;
	} catch {
		return null;
	}
}
