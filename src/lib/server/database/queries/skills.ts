import { asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import db from '../drizzle';
import {
	skillTable,
	skillCategoryTable,
	skillCategoryDisciplineTable,
	type Skill,
	type SkillCategory,
	type SkillSelect,
	type SkillCategorySelect,
	type UpdateSkill,
	type UpdateSkillCategory,
	disciplineTable,
	experienceLevelTable,
	type ExperienceLevel,
	type UpdateExperienceLevel
} from '../schemas/skill';
import type { PaginateOptions } from '$lib/types';
import { DEFAULT_MAX_RECORD_LIMIT } from '$lib/config/constants';
import { error } from '@sveltejs/kit';

export type SkillsWithCategoryRaw = {
	id: string;
	name: string;
	category_name: string;
};

export type SkillsResults = SkillsWithCategoryRaw[];

export type ExperienceLevelsRaw = {
	id: string;
	value: string;
};

export type ExperienceLevelResults = ExperienceLevelsRaw[];

export type CatalogSkill = {
	id: string;
	categoryId: string;
	name: string;
	sortOrder: number;
	requiresCertificate: boolean;
	archivedAt: Date | null;
};

export type CatalogCategory = {
	id: string;
	name: string;
	description: string | null;
	sortOrder: number;
	archivedAt: Date | null;
	/** Disciplines this category is scoped to. Empty = applies to every discipline. */
	disciplineIds: string[];
	skills: CatalogSkill[];
};

/**
 * The skill taxonomy as categories → skills, in display order.
 *
 * `disciplineIds` scopes it: only categories tagged to one of them, or untagged
 * (global), are returned. Omit it for the full catalog (admin). Archived rows are
 * left out unless `includeArchived` — pickers pass `keepSkillIds` so an archived
 * skill someone already holds/requires still renders instead of vanishing.
 */
export async function getSkillCatalog(
	opts: {
		disciplineIds?: string[];
		includeArchived?: boolean;
		keepSkillIds?: string[];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		tx?: any;
	} = {}
): Promise<CatalogCategory[]> {
	const exec = opts.tx ?? db;
	const keep = new Set(opts.keepSkillIds ?? []);

	const [categories, tags, skills] = await Promise.all([
		exec
			.select()
			.from(skillCategoryTable)
			.orderBy(asc(skillCategoryTable.sortOrder), asc(skillCategoryTable.name)),
		exec.select().from(skillCategoryDisciplineTable),
		exec.select().from(skillTable).orderBy(asc(skillTable.sortOrder), asc(skillTable.name))
	]);

	const tagsByCategory = new Map<string, string[]>();
	for (const t of tags as { categoryId: string; disciplineId: string }[]) {
		const list = tagsByCategory.get(t.categoryId) ?? [];
		list.push(t.disciplineId);
		tagsByCategory.set(t.categoryId, list);
	}

	const scope = opts.disciplineIds ? new Set(opts.disciplineIds) : null;

	const result: CatalogCategory[] = [];
	for (const c of categories as SkillCategorySelect[]) {
		const disciplineIds = tagsByCategory.get(c.id) ?? [];
		const inScope = !scope || disciplineIds.length === 0 || disciplineIds.some((d) => scope.has(d));

		const categorySkills = (skills as SkillSelect[])
			.filter((s) => s.categoryId === c.id)
			.filter((s) => opts.includeArchived || !s.archivedAt || keep.has(s.id))
			.map((s) => ({
				id: s.id,
				categoryId: s.categoryId,
				name: s.name,
				sortOrder: s.sortOrder,
				requiresCertificate: s.requiresCertificate,
				archivedAt: s.archivedAt
			}));

		const hasKept = categorySkills.some((s) => keep.has(s.id));
		if (!inScope && !hasKept) continue;
		if (c.archivedAt && !opts.includeArchived && !hasKept) continue;
		if (!opts.includeArchived && categorySkills.length === 0) continue;

		result.push({
			id: c.id,
			name: c.name,
			description: c.description,
			sortOrder: c.sortOrder,
			archivedAt: c.archivedAt,
			disciplineIds,
			skills: categorySkills
		});
	}
	return result;
}

export async function getAllSkills(searchTerm?: string) {
	return await db
		.select({
			id: skillTable.id,
			name: skillTable.name,
			categoryId: skillTable.categoryId,
			sortOrder: skillTable.sortOrder,
			requiresCertificate: skillTable.requiresCertificate,
			archivedAt: skillTable.archivedAt,
			createdAt: skillTable.createdAt,
			updatedAt: skillTable.updatedAt,
			categoryName: skillCategoryTable.name,
			// How many professionals claim it / requisitions require it. Drives the
			// "archive, don't delete" choice in the admin UI.
			candidateCount: sql<number>`(SELECT count(*)::int FROM candidate_skills cs WHERE cs.skill_id = ${skillTable.id})`,
			requisitionCount: sql<number>`(SELECT count(*)::int FROM requisition_skills rs WHERE rs.skill_id = ${skillTable.id})`
		})
		.from(skillTable)
		.innerJoin(skillCategoryTable, eq(skillCategoryTable.id, skillTable.categoryId))
		.where(
			searchTerm
				? or(
						ilike(skillTable.name, `%${searchTerm}%`),
						ilike(skillCategoryTable.name, `%${searchTerm}%`)
					)
				: undefined
		)
		.orderBy(
			asc(skillCategoryTable.sortOrder),
			asc(skillCategoryTable.name),
			asc(skillTable.sortOrder),
			asc(skillTable.name)
		)
		.limit(DEFAULT_MAX_RECORD_LIMIT);
}

export async function getAllSkillCategories(searchTerm?: string) {
	const rows = await db
		.select({
			id: skillCategoryTable.id,
			name: skillCategoryTable.name,
			description: skillCategoryTable.description,
			sortOrder: skillCategoryTable.sortOrder,
			archivedAt: skillCategoryTable.archivedAt,
			createdAt: skillCategoryTable.createdAt,
			updatedAt: skillCategoryTable.updatedAt,
			skillCount: sql<number>`(SELECT count(*)::int FROM skills s WHERE s.category_id = ${skillCategoryTable.id})`,
			requisitionCount: sql<number>`(SELECT count(*)::int FROM requisition_skill_categories rc WHERE rc.category_id = ${skillCategoryTable.id})`
		})
		.from(skillCategoryTable)
		.where(searchTerm ? ilike(skillCategoryTable.name, `%${searchTerm}%`) : undefined)
		.orderBy(asc(skillCategoryTable.sortOrder), asc(skillCategoryTable.name))
		.limit(DEFAULT_MAX_RECORD_LIMIT);

	const tags = await db.select().from(skillCategoryDisciplineTable);
	return rows.map((r) => ({
		...r,
		disciplineIds: tags.filter((t) => t.categoryId === r.id).map((t) => t.disciplineId)
	}));
}

/** Postgres unique_violation — a duplicate (case-insensitive) name. */
export function isUniqueViolation(e: unknown): boolean {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const code = (e as any)?.code ?? (e as any)?.cause?.code;
	return code === '23505';
}

export async function createNewSkill(values: Skill) {
	const [maxRow] = await db
		.select({ max: sql<number>`coalesce(max(${skillTable.sortOrder}), -1)::int` })
		.from(skillTable)
		.where(eq(skillTable.categoryId, values.categoryId));
	const [row] = await db
		.insert(skillTable)
		.values({ sortOrder: (maxRow?.max ?? -1) + 1, ...values })
		.returning();
	return row ?? null;
}

export async function updateSkill(id: string, values: UpdateSkill) {
	const [row] = await db
		.update(skillTable)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(skillTable.id, id))
		.returning();
	return row ?? null;
}

/**
 * Hard delete, only when nothing references the skill. FKs are RESTRICT, so this
 * would fail anyway — the check just turns a 500 into a readable refusal.
 */
export async function deleteSkillIfUnused(id: string): Promise<'DELETED' | 'IN_USE' | 'NOT_FOUND'> {
	const usage = await db.execute<{ n: number }>(sql`SELECT (
		(SELECT count(*) FROM candidate_skills WHERE skill_id = ${id})
		+ (SELECT count(*) FROM requisition_skills WHERE skill_id = ${id})
		+ (SELECT count(*) FROM candidate_document_uploads WHERE skill_id = ${id})
	)::int AS n`);
	if ((usage.rows[0]?.n ?? 0) > 0) return 'IN_USE';
	const deleted = await db.delete(skillTable).where(eq(skillTable.id, id)).returning();
	return deleted.length ? 'DELETED' : 'NOT_FOUND';
}

/** Rewrites sort_order to the given sequence. Ids not in `orderedIds` are untouched. */
export async function reorderSkills(orderedIds: string[]) {
	await db.transaction(async (tx) => {
		for (const [i, id] of orderedIds.entries()) {
			await tx.update(skillTable).set({ sortOrder: i }).where(eq(skillTable.id, id));
		}
	});
}

export async function createNewSkillCategory(values: SkillCategory, disciplineIds: string[] = []) {
	return await db.transaction(async (tx) => {
		const [maxRow] = await tx
			.select({ max: sql<number>`coalesce(max(${skillCategoryTable.sortOrder}), -1)::int` })
			.from(skillCategoryTable);
		const [row] = await tx
			.insert(skillCategoryTable)
			.values({ sortOrder: (maxRow?.max ?? -1) + 1, ...values })
			.returning();
		if (row && disciplineIds.length) {
			await tx
				.insert(skillCategoryDisciplineTable)
				.values(disciplineIds.map((disciplineId) => ({ categoryId: row.id, disciplineId })));
		}
		return row ?? null;
	});
}

/** `disciplineIds` undefined = leave the scope alone; [] = make the category global. */
export async function updateSkillCategory(
	id: string,
	values: UpdateSkillCategory,
	disciplineIds?: string[]
) {
	return await db.transaction(async (tx) => {
		const [row] = await tx
			.update(skillCategoryTable)
			.set({ ...values, updatedAt: new Date() })
			.where(eq(skillCategoryTable.id, id))
			.returning();
		if (row && disciplineIds) {
			await tx
				.delete(skillCategoryDisciplineTable)
				.where(eq(skillCategoryDisciplineTable.categoryId, id));
			if (disciplineIds.length) {
				await tx
					.insert(skillCategoryDisciplineTable)
					.values(disciplineIds.map((disciplineId) => ({ categoryId: id, disciplineId })));
			}
		}
		return row ?? null;
	});
}

/** Hard delete, only for a category with no skills and no requisition rows. */
export async function deleteSkillCategoryIfUnused(
	id: string
): Promise<'DELETED' | 'IN_USE' | 'NOT_FOUND'> {
	const usage = await db.execute<{ n: number }>(sql`SELECT (
		(SELECT count(*) FROM skills WHERE category_id = ${id})
		+ (SELECT count(*) FROM requisition_skill_categories WHERE category_id = ${id})
	)::int AS n`);
	if ((usage.rows[0]?.n ?? 0) > 0) return 'IN_USE';
	const deleted = await db
		.delete(skillCategoryTable)
		.where(eq(skillCategoryTable.id, id))
		.returning();
	return deleted.length ? 'DELETED' : 'NOT_FOUND';
}

export async function reorderSkillCategories(orderedIds: string[]) {
	await db.transaction(async (tx) => {
		for (const [i, id] of orderedIds.entries()) {
			await tx
				.update(skillCategoryTable)
				.set({ sortOrder: i })
				.where(eq(skillCategoryTable.id, id));
		}
	});
}

export async function getAllDisciplines() {
	return await db.select().from(disciplineTable).orderBy(asc(disciplineTable.name));
}

export async function getAllExperienceLevels(searchTerm?: string) {
	try {
		const results = await db
			.select()
			.from(experienceLevelTable)
			.where(searchTerm ? ilike(experienceLevelTable.value, `%${searchTerm}%`) : undefined)
			.orderBy(asc(experienceLevelTable.order), asc(experienceLevelTable.value))
			.limit(DEFAULT_MAX_RECORD_LIMIT);

		return results;
	} catch (err) {
		console.error('Error fetching experience levels:', error);
		throw error(500, 'Failed to fetch experience levels');
	}
}

export async function getPaginatedExperienceLevels({
	limit = 10,
	offset = 0,
	orderBy = undefined
}: PaginateOptions) {
	try {
		const orderSelector = orderBy ? `e.${orderBy.column}` : null;

		const query = sql.empty();

		query.append(sql`
      SELECT e.*
      FROM ${experienceLevelTable} AS e
    `);

		if (orderSelector && orderBy) {
			query.append(sql`
				ORDER BY ${
					orderBy.direction === 'asc'
						? sql`${sql.raw(orderSelector)} ASC`
						: sql`${sql.raw(orderSelector)} DESC`
				}
			`);
		} else {
			query.append(sql`
				ORDER BY e.created_at DESC
			`);
		}

		query.append(sql`
      LIMIT ${limit}
      OFFSET ${offset}
    `);

		const countResult = await db.select({ value: count() }).from(experienceLevelTable);

		const results = await db.execute(query);

		return {
			experienceLevels: results.rows,
			count: countResult[0].value
		};
	} catch (error) {
		console.error(error);
	}
}

export async function createNewExperienceLevel(values: ExperienceLevel) {
	const result = await db
		.insert(experienceLevelTable)
		.values(values)
		.onConflictDoNothing()
		.returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}

export async function updateExperienceLevel(id: string, values: UpdateExperienceLevel) {
	const result = await db
		.update(experienceLevelTable)
		.set(values)
		.where(eq(experienceLevelTable.id, id))
		.returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}

export async function deleteExperienceLevel(id: string) {
	const result = await db
		.delete(experienceLevelTable)
		.where(eq(experienceLevelTable.id, id))
		.returning();

	if (result.length === 0) {
		return null;
	} else {
		return result[0];
	}
}
