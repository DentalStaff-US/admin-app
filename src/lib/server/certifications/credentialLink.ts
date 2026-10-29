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
import {
	candidateDisciplineExperienceTable,
	candidateSkillTable
} from '$lib/server/database/schemas/candidate';
import { skillTable } from '$lib/server/database/schemas/skill';
import { LINKABLE_CREDENTIAL_TYPES } from './credentialStatus';

export type CredentialLinkDecision =
	| { ok: true }
	| { ok: false; reason: 'NOT_HELD' | 'NOT_A_CREDENTIAL'; message: string };

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
 * Full validation for a link write. Two rules:
 *   1. only LICENSE/CERTIFICATE may be linked (an AGREEMENT with an expiry must
 *      never gate placement);
 *   2. the professional must hold the discipline.
 *
 * An expiry is NOT required. It used to be, on the reasoning that a link without a
 * date tracks nothing — but that was wrong for both kinds of credential. A dental
 * LICENSE does not expire at all; it is held until revoked, so demanding a date made
 * it impossible to file one. And a CERTIFICATE here is only supporting evidence: the
 * date the gate reads lives on the Experience & Rates entry, not on the document.
 *
 * So a dateless link is a perfectly ordinary record of "this document belongs to
 * that discipline", and refusing it blocked real uploads.
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
			message: 'Only a License/Registration or Certification can be linked to a discipline.'
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

export type SkillCredentialLinkDecision =
	| { ok: true }
	| {
			ok: false;
			reason: 'NOT_HELD' | 'NOT_A_CERTIFICATE' | 'NO_CERT_REQUIRED' | 'BOTH_LINKS' | 'NO_EXPIRY';
			message: string;
	  };

/**
 * Rules for linking a document to a SKILL (e.g. a CPR card to "CPR/BLS"):
 *   1. a document evidences a discipline OR a skill, never both;
 *   2. only a CERTIFICATE;
 *   3. only a skill that requires one (skills.requires_certificate);
 *   4. only a skill the professional has claimed;
 *   5. an expiry date is REQUIRED — unlike a dental license, every skill
 *      certificate we gate on (CPR/BLS, nitrous, anesthesia) lapses, and a dateless
 *      one would let an expired card hide behind it. See candidateHoldsSkillSql.
 */
export async function validateSkillCredentialLink(
	opts: {
		candidateId: string;
		skillId: string | null | undefined;
		disciplineId: string | null | undefined;
		type: string | null | undefined;
		expiryDate: string | Date | null | undefined;
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	tx: any = db
): Promise<SkillCredentialLinkDecision> {
	if (!opts.skillId) return { ok: true };

	if (opts.disciplineId) {
		return {
			ok: false,
			reason: 'BOTH_LINKS',
			message: 'A document can be linked to a discipline or a skill, not both.'
		};
	}
	if (opts.type !== 'CERTIFICATE') {
		return {
			ok: false,
			reason: 'NOT_A_CERTIFICATE',
			message: 'Only a Certification can be linked to a skill.'
		};
	}

	const [row] = await tx
		.select({
			requiresCertificate: skillTable.requiresCertificate,
			held: candidateSkillTable.skillId
		})
		.from(skillTable)
		.leftJoin(
			candidateSkillTable,
			and(
				eq(candidateSkillTable.skillId, skillTable.id),
				eq(candidateSkillTable.candidateId, opts.candidateId)
			)
		)
		.where(eq(skillTable.id, opts.skillId))
		.limit(1);

	if (!row?.held) {
		return {
			ok: false,
			reason: 'NOT_HELD',
			message: 'You do not have that skill on your profile.'
		};
	}
	if (!row.requiresCertificate) {
		return {
			ok: false,
			reason: 'NO_CERT_REQUIRED',
			message: 'That skill does not take a certificate.'
		};
	}
	if (!toCredentialExpiryDate(opts.expiryDate ?? null)) {
		return {
			ok: false,
			reason: 'NO_EXPIRY',
			message: 'Enter the expiration date shown on the certificate.'
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
