/**
 * The ONLY writer for candidate_discipline_experience's certification columns.
 *
 * Deliberately separate from `replaceCandidateDisciplines`, which owns the
 * experience columns and cannot touch these. Two narrow writers rather than one wide
 * one is what makes "a rate edit can never clear a certification" a structural fact
 * instead of a convention.
 *
 * Shared by the candidate endpoint and the admin action so the monotonic rule and the
 * audit write exist exactly once.
 */

import { and, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateDisciplineExperienceTable as cde } from '$lib/server/database/schemas/candidate';
import { recordAction } from '$lib/server/audit/audit';
import { todayInET } from './credentialStatus';

export type SetCertificationResult =
	| { ok: true }
	| {
			ok: false;
			reason: 'NOT_HELD' | 'CANNOT_DISABLE' | 'PAST_DATE' | 'NO_CHANGE';
			message: string;
	  };

export async function setDisciplineCertification(opts: {
	candidateId: string;
	disciplineId: string;
	/** Omit to leave unchanged. Only an admin may pass false. */
	requiresCert?: boolean;
	/** 'YYYY-MM-DD'. Omit to leave unchanged; null to clear (admin only). */
	certExpiresOn?: string | null;
	/** The CERTIFICATE evidencing this date, when the caller has one. */
	documentId?: string | null;
	/** Admin paths only. A professional may turn tracking ON but never OFF. */
	allowDisable?: boolean;
	/** Admins may record a date in the past; professionals may not. */
	allowPastDate?: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	actor?: any;
}): Promise<SetCertificationResult> {
	const [existing] = await db
		.select({
			requiresCert: cde.requiresCert,
			certExpiresOn: cde.certExpiresOn
		})
		.from(cde)
		.where(and(eq(cde.candidateId, opts.candidateId), eq(cde.disciplineId, opts.disciplineId)))
		.limit(1);

	// The row must already exist. This is what keeps the write to a single row and
	// stops an Experience & Rates entry being created through this door.
	if (!existing) {
		return {
			ok: false,
			reason: 'NOT_HELD',
			message: 'That discipline is not on this profile.'
		};
	}

	const nextRequires = opts.requiresCert ?? existing.requiresCert;

	// The monotonic rule lives here, not only in a zod literal, so both callers get it.
	if (existing.requiresCert && nextRequires === false && !opts.allowDisable) {
		return {
			ok: false,
			reason: 'CANNOT_DISABLE',
			message:
				'Certification tracking can only be turned off by DTSS staff. Contact support if this was added by mistake.'
		};
	}

	const nextExpiry =
		opts.certExpiresOn !== undefined ? opts.certExpiresOn : existing.certExpiresOn;

	// A professional may correct a mistyped date but not back-date one. Refusing to
	// let them fix a typo while their job visibility depends on it would be
	// indefensible, which is why this checks the new value rather than requiring it
	// to be later than the old one.
	if (nextRequires && nextExpiry && !opts.allowPastDate && nextExpiry < todayInET()) {
		return {
			ok: false,
			reason: 'PAST_DATE',
			message: 'That expiration date has already passed. Contact support to record a lapsed certification.'
		};
	}

	if (nextRequires === existing.requiresCert && nextExpiry === existing.certExpiresOn) {
		return { ok: false, reason: 'NO_CHANGE', message: 'Nothing to change.' };
	}

	await db.transaction(async (tx) => {
		await tx
			.update(cde)
			.set({
				requiresCert: nextRequires,
				// Turning tracking off clears the date, or a stale one resurrects if it
				// is ever switched back on.
				certExpiresOn: nextRequires ? (nextExpiry ?? null) : null,
				updatedAt: new Date()
			})
			.where(and(eq(cde.candidateId, opts.candidateId), eq(cde.disciplineId, opts.disciplineId)));

		await recordAction({
			entityType: 'CANDIDATES',
			entityId: opts.candidateId,
			action: 'UPDATE',
			actor: opts.actor,
			before: { requiresCert: existing.requiresCert, certExpiresOn: existing.certExpiresOn },
			after: { requiresCert: nextRequires, certExpiresOn: nextRequires ? nextExpiry : null },
			// `field` is what the admin digest's verification queue filters on — a
			// certification date changed with no new document is the single thing most
			// worth a human look.
			metadata: {
				field: 'disciplineCertification',
				disciplineId: opts.disciplineId,
				documentId: opts.documentId ?? null
			},
			tx
		});
	});

	return { ok: true };
}
