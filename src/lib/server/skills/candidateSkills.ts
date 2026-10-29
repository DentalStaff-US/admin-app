/**
 * A professional's skills: reading them (with certificate state), deciding who may
 * change them, and the single writer.
 *
 * Lock rule (client requirement): editable by everyone while the professional is
 * PENDING; once approved, only an admin. Same "approved" definition as documents and
 * Experience & Rates — isCandidateFrozen. Certificate uploads/renewals for a skill
 * are NOT locked (they go through the document paths, which already allow it).
 */

import { and, eq, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	candidateDisciplineExperienceTable,
	candidateDocumentUploadsTable,
	candidateSkillTable
} from '$lib/server/database/schemas/candidate';
import { getSkillCatalog } from '$lib/server/database/queries/skills';
import { isCandidateFrozen } from '$lib/server/documents/candidateDocumentGuards';
import { recordAction, type AuditActor } from '$lib/server/audit/audit';
import { USER_ROLES } from '$lib/config/constants';

// Reads live in ./effectiveSkills (no audit import, so matching queries can use them
// without dragging in the request-scoped ledger writer). Re-exported for callers.
export {
	getCandidateSkills,
	getEffectiveSkillIds,
	getEffectiveSkillIdsForCandidate,
	type CandidateSkillRow
} from './effectiveSkills';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export type SkillsEditDecision =
	| { allowed: true }
	| { allowed: false; reason: 'APPROVED'; message: string };

/** Pure. SUPERADMIN may always edit; anyone else only while not approved. */
export function canEditCandidateSkills(
	profile: { approved?: boolean | null; status?: string | null },
	actorRole: string | null | undefined
): SkillsEditDecision {
	if (actorRole === USER_ROLES.SUPERADMIN) return { allowed: true };
	if (isCandidateFrozen(profile)) {
		return {
			allowed: false,
			reason: 'APPROVED',
			message:
				'Your skills are locked now that your profile is approved. Contact support to make a change.'
		};
	}
	return { allowed: true };
}

export class SkillWriteError extends Error {
	constructor(
		public reason: 'UNKNOWN_SKILL' | 'ARCHIVED' | 'OUT_OF_SCOPE',
		message: string
	) {
		super(message);
	}
}

/**
 * Replace a professional's skill set. Validates every NEW skill exists, is not
 * archived, and is in scope for one of their disciplines (an archived or
 * out-of-scope skill they already hold may be kept — it just can't be added).
 * Unlinks skill certificates for skills removed. Audited.
 *
 * Does NOT check the lock — callers decide with canEditCandidateSkills, because only
 * they know the actor's role.
 */
export async function replaceCandidateSkills(
	candidateId: string,
	skillIds: string[],
	opts: { actor: AuditActor | string | null; tx?: Tx }
): Promise<{ added: string[]; removed: string[] }> {
	const run = async (tx: Tx) => {
		const wanted = [...new Set(skillIds)];
		const current: string[] = (
			await tx
				.select({ skillId: candidateSkillTable.skillId })
				.from(candidateSkillTable)
				.where(eq(candidateSkillTable.candidateId, candidateId))
		).map((r: { skillId: string }) => r.skillId);

		const currentSet = new Set(current);
		const added = wanted.filter((id) => !currentSet.has(id));
		const wantedSet = new Set(wanted);
		const removed = current.filter((id) => !wantedSet.has(id));

		if (added.length) {
			const disciplineIds: string[] = (
				await tx
					.select({ disciplineId: candidateDisciplineExperienceTable.disciplineId })
					.from(candidateDisciplineExperienceTable)
					.where(eq(candidateDisciplineExperienceTable.candidateId, candidateId))
			).map((r: { disciplineId: string }) => r.disciplineId);

			const all = await getSkillCatalog({ includeArchived: true, tx });
			const scoped = await getSkillCatalog({ disciplineIds, tx });
			const allSkills = new Map(all.flatMap((c) => c.skills).map((s) => [s.id, s]));
			const scopedIds = new Set(scoped.flatMap((c) => c.skills).map((s) => s.id));

			for (const id of added) {
				const s = allSkills.get(id);
				if (!s)
					throw new SkillWriteError(
						'UNKNOWN_SKILL',
						'One of the selected skills no longer exists.'
					);
				if (s.archivedAt)
					throw new SkillWriteError('ARCHIVED', `"${s.name}" is no longer offered.`);
				if (!scopedIds.has(id)) {
					throw new SkillWriteError(
						'OUT_OF_SCOPE',
						`"${s.name}" does not apply to the disciplines on this profile.`
					);
				}
			}
		}

		if (removed.length) {
			await tx
				.delete(candidateSkillTable)
				.where(
					and(
						eq(candidateSkillTable.candidateId, candidateId),
						inArray(candidateSkillTable.skillId, removed)
					)
				);
			// A certificate for a skill no longer claimed proves nothing; keep the file,
			// drop the link (same as a discipline link would read).
			await tx
				.update(candidateDocumentUploadsTable)
				.set({ skillId: null, updatedAt: new Date() })
				.where(
					and(
						eq(candidateDocumentUploadsTable.candidateId, candidateId),
						inArray(candidateDocumentUploadsTable.skillId, removed)
					)
				);
		}

		const actorId = typeof opts.actor === 'string' ? opts.actor : (opts.actor?.id ?? null);
		if (added.length) {
			await tx
				.insert(candidateSkillTable)
				.values(added.map((skillId) => ({ candidateId, skillId, createdByUserId: actorId })))
				.onConflictDoNothing();
		}

		if (added.length || removed.length) {
			await recordAction({
				entityType: 'CANDIDATES',
				entityId: candidateId,
				action: 'UPDATE',
				actor: opts.actor,
				before: { skills: current },
				after: { skills: wanted },
				metadata: { field: 'skills', added, removed },
				tx
			});
		}

		return { added, removed };
	};

	return opts.tx ? run(opts.tx) : db.transaction(run);
}
