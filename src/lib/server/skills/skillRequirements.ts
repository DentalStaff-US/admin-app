/**
 * Skill requirements on a requisition, and the rule for whether a professional
 * meets them. Pure — no database imports — so it runs inside `.filter(...)` and in
 * unit tests. The SQL twin is `skillRequirementsMetSql` in ./skillCredentialSql.ts;
 * the two MUST change together.
 *
 * Shape: per category, a match mode and the chosen skills.
 *   - category absent        → "No Preference": never filters.
 *   - ALL of [a, b]          → the professional must effectively hold a AND b.
 *   - ANY of [a, b]          → the professional must effectively hold a OR b.
 *
 * "Effectively hold" = claimed on the profile AND, when the skill requires a
 * certificate, backed by a linked unexpired CERTIFICATE. Callers resolve that once
 * (getEffectiveSkillIds / candidateHoldsSkillSql) and pass the resulting id set in.
 */

import { z } from 'zod';

export const SKILL_MATCH_MODES = ['ALL', 'ANY'] as const;
export type SkillMatchMode = (typeof SKILL_MATCH_MODES)[number];

export type SkillRequirementCategory = {
	categoryId: string;
	matchMode: SkillMatchMode;
	skillIds: string[];
};

export type MissingSkillRequirement = {
	categoryId: string;
	matchMode: SkillMatchMode;
	/** ALL: the chosen skills not held. ANY: every chosen skill (none is held). */
	skillIds: string[];
};

export type SkillRequirementCheck =
	| { ok: true; missing: [] }
	| { ok: false; missing: MissingSkillRequirement[] };

export function checkSkillRequirements(
	requirements: readonly SkillRequirementCategory[] | null | undefined,
	heldSkillIds: ReadonlySet<string> | null | undefined
): SkillRequirementCheck {
	const held = heldSkillIds ?? new Set<string>();
	const missing: MissingSkillRequirement[] = [];

	for (const req of requirements ?? []) {
		// An empty category is "No Preference" — the writer never stores one, but a
		// hand-built or legacy input must not fail everyone.
		if (req.skillIds.length === 0) continue;

		if (req.matchMode === 'ANY') {
			if (!req.skillIds.some((id) => held.has(id))) {
				missing.push({ categoryId: req.categoryId, matchMode: 'ANY', skillIds: [...req.skillIds] });
			}
		} else {
			const notHeld = req.skillIds.filter((id) => !held.has(id));
			if (notHeld.length > 0) {
				missing.push({ categoryId: req.categoryId, matchMode: 'ALL', skillIds: notHeld });
			}
		}
	}

	return missing.length === 0 ? { ok: true, missing: [] } : { ok: false, missing };
}

/** True when a requisition has at least one category that actually filters. */
export function hasSkillRequirements(
	requirements: readonly SkillRequirementCategory[] | null | undefined
): boolean {
	return (requirements ?? []).some((r) => r.skillIds.length > 0);
}

const skillRequirementCategorySchema = z.object({
	categoryId: z.string().min(1),
	matchMode: z.enum(SKILL_MATCH_MODES),
	skillIds: z.array(z.string().min(1))
});

export const skillRequirementsSchema = z.array(skillRequirementCategorySchema);

/**
 * Parse the `skillRequirements` form field (a JSON string from
 * SkillRequirementsPicker). Absent/blank = no requirements. Throws on malformed
 * input rather than silently dropping a client's requirements.
 *
 * Normalises: drops No-Preference (empty) categories, de-duplicates skills, and
 * collapses a repeated category into its last occurrence.
 */
export function parseSkillRequirementsInput(
	raw: FormDataEntryValue | string | null | undefined
): SkillRequirementCategory[] {
	if (raw === null || raw === undefined) return [];
	if (typeof raw !== 'string') throw new Error('skillRequirements must be a JSON string');
	const trimmed = raw.trim();
	if (trimmed === '') return [];

	let json: unknown;
	try {
		json = JSON.parse(trimmed);
	} catch {
		throw new Error('skillRequirements is not valid JSON');
	}

	const parsed = skillRequirementsSchema.parse(json);
	const byCategory = new Map<string, SkillRequirementCategory>();
	for (const r of parsed) {
		const skillIds = [...new Set(r.skillIds)];
		if (skillIds.length === 0) {
			byCategory.delete(r.categoryId);
			continue;
		}
		byCategory.set(r.categoryId, { categoryId: r.categoryId, matchMode: r.matchMode, skillIds });
	}
	return [...byCategory.values()];
}
