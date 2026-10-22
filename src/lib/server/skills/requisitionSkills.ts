/**
 * Skill requirements on a requisition: loading and the single writer.
 *
 * Storage: one requisition_skill_categories row per category that filters (with its
 * ALL/ANY mode) + one requisition_skills row per chosen skill. A category with no
 * row is No Preference. A requisition with no rows at all — every requisition
 * created before this feature — matches exactly as it always has.
 */

import { eq, inArray } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	requisitionSkillCategoryTable,
	requisitionSkillTable
} from '$lib/server/database/schemas/requisition';
import { skillCategoryTable, skillTable } from '$lib/server/database/schemas/skill';
import { getSkillCatalog } from '$lib/server/database/queries/skills';
import type { SkillMatchMode, SkillRequirementCategory } from './skillRequirements';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

/** Requirements for many requisitions at once. Requisitions with none map to []. */
export async function getSkillRequirementsForRequisitions(
	requisitionIds: number[],
	tx: Tx = db
): Promise<Map<number, SkillRequirementCategory[]>> {
	const ids = [...new Set(requisitionIds)];
	const out = new Map<number, SkillRequirementCategory[]>(ids.map((id) => [id, []]));
	if (ids.length === 0) return out;

	const [categories, skills] = await Promise.all([
		tx
			.select()
			.from(requisitionSkillCategoryTable)
			.where(inArray(requisitionSkillCategoryTable.requisitionId, ids)),
		tx
			.select({
				requisitionId: requisitionSkillTable.requisitionId,
				skillId: requisitionSkillTable.skillId,
				categoryId: skillTable.categoryId
			})
			.from(requisitionSkillTable)
			.innerJoin(skillTable, eq(skillTable.id, requisitionSkillTable.skillId))
			.where(inArray(requisitionSkillTable.requisitionId, ids))
	]);

	for (const c of categories as {
		requisitionId: number;
		categoryId: string;
		matchMode: SkillMatchMode;
	}[]) {
		const skillIds = (skills as { requisitionId: number; skillId: string; categoryId: string }[])
			.filter((s) => s.requisitionId === c.requisitionId && s.categoryId === c.categoryId)
			.map((s) => s.skillId);
		out.get(c.requisitionId)!.push({ categoryId: c.categoryId, matchMode: c.matchMode, skillIds });
	}
	return out;
}

export async function getSkillRequirements(
	requisitionId: number,
	tx: Tx = db
): Promise<SkillRequirementCategory[]> {
	return (await getSkillRequirementsForRequisitions([requisitionId], tx)).get(requisitionId) ?? [];
}

export type SkillRequirementDisplay = {
	categoryId: string;
	categoryName: string;
	matchMode: SkillMatchMode;
	skills: { id: string; name: string; requiresCertificate: boolean }[];
};

/** Requirements with names, for detail pages and candidate-facing payloads. */
export async function getSkillRequirementsForDisplay(
	requisitionIds: number[],
	tx: Tx = db
): Promise<Map<number, SkillRequirementDisplay[]>> {
	const ids = [...new Set(requisitionIds)];
	const out = new Map<number, SkillRequirementDisplay[]>(ids.map((id) => [id, []]));
	if (ids.length === 0) return out;

	const [categories, skills] = await Promise.all([
		tx
			.select({
				requisitionId: requisitionSkillCategoryTable.requisitionId,
				categoryId: requisitionSkillCategoryTable.categoryId,
				matchMode: requisitionSkillCategoryTable.matchMode,
				categoryName: skillCategoryTable.name,
				sortOrder: skillCategoryTable.sortOrder
			})
			.from(requisitionSkillCategoryTable)
			.innerJoin(
				skillCategoryTable,
				eq(skillCategoryTable.id, requisitionSkillCategoryTable.categoryId)
			)
			.where(inArray(requisitionSkillCategoryTable.requisitionId, ids))
			.orderBy(skillCategoryTable.sortOrder, skillCategoryTable.name),
		tx
			.select({
				requisitionId: requisitionSkillTable.requisitionId,
				id: skillTable.id,
				name: skillTable.name,
				categoryId: skillTable.categoryId,
				requiresCertificate: skillTable.requiresCertificate
			})
			.from(requisitionSkillTable)
			.innerJoin(skillTable, eq(skillTable.id, requisitionSkillTable.skillId))
			.where(inArray(requisitionSkillTable.requisitionId, ids))
			.orderBy(skillTable.sortOrder, skillTable.name)
	]);

	for (const c of categories) {
		out.get(c.requisitionId)!.push({
			categoryId: c.categoryId,
			categoryName: c.categoryName,
			matchMode: c.matchMode,
			skills: skills
				.filter(
					(s: { requisitionId: number; categoryId: string }) =>
						s.requisitionId === c.requisitionId && s.categoryId === c.categoryId
				)
				.map((s: { id: string; name: string; requiresCertificate: boolean }) => ({
					id: s.id,
					name: s.name,
					requiresCertificate: s.requiresCertificate
				}))
		});
	}
	return out;
}

export class SkillRequirementError extends Error {
	constructor(message: string) {
		super(message);
	}
}

/**
 * Replace a requisition's requirements. Every skill must belong to the category it
 * is listed under, and every category must be in scope for the requisition's
 * discipline. New picks may not be archived; archived ones already on the
 * requisition may be kept (editing an old posting must not force a re-pick).
 *
 * Returns before/after for the caller's audit record.
 */
export async function setRequisitionSkillRequirements(
	requisitionId: number,
	disciplineId: string,
	requirements: SkillRequirementCategory[],
	tx: Tx
): Promise<{ before: SkillRequirementCategory[]; after: SkillRequirementCategory[] }> {
	const before = await getSkillRequirements(requisitionId, tx);
	const after = requirements.filter((r) => r.skillIds.length > 0);

	if (after.length) {
		const alreadyThere = new Set(before.flatMap((r) => r.skillIds));
		const all = await getSkillCatalog({ includeArchived: true, tx });
		const scoped = new Set(
			(await getSkillCatalog({ disciplineIds: [disciplineId], includeArchived: true, tx })).map(
				(c) => c.id
			)
		);
		const categories = new Map(all.map((c) => [c.id, c]));

		for (const r of after) {
			const cat = categories.get(r.categoryId);
			if (!cat) throw new SkillRequirementError('A selected skill category no longer exists.');
			if (!scoped.has(cat.id) && !before.some((b) => b.categoryId === cat.id)) {
				throw new SkillRequirementError(
					`"${cat.name}" does not apply to this requisition's discipline.`
				);
			}
			for (const id of r.skillIds) {
				const s = cat.skills.find((x) => x.id === id);
				if (!s) throw new SkillRequirementError(`A selected skill is not part of "${cat.name}".`);
				if (s.archivedAt && !alreadyThere.has(id)) {
					throw new SkillRequirementError(`"${s.name}" is no longer offered.`);
				}
			}
		}
	}

	await tx
		.delete(requisitionSkillTable)
		.where(eq(requisitionSkillTable.requisitionId, requisitionId));
	await tx
		.delete(requisitionSkillCategoryTable)
		.where(eq(requisitionSkillCategoryTable.requisitionId, requisitionId));

	if (after.length) {
		await tx
			.insert(requisitionSkillCategoryTable)
			.values(
				after.map((r) => ({ requisitionId, categoryId: r.categoryId, matchMode: r.matchMode }))
			);
		await tx
			.insert(requisitionSkillTable)
			.values(after.flatMap((r) => r.skillIds.map((skillId) => ({ requisitionId, skillId }))));
	}

	return { before, after };
}
