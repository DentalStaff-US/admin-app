import {
	pgTable,
	text,
	timestamp,
	integer,
	boolean,
	index,
	uniqueIndex,
	primaryKey
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The skill taxonomy: categories → skills. Professionals claim skills
 * (candidate_skills) and requisitions require them per category
 * (requisition_skill_categories + requisition_skills). See src/lib/server/skills/.
 *
 * Rows are ARCHIVED, never deleted, once anything references them — the FK from
 * skills → skill_categories is RESTRICT so deleting a category can no longer
 * silently take its skills (and every profile/requisition link) with it.
 */
export const skillTable = pgTable(
	'skills',
	{
		id: text('id').notNull().primaryKey(),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		categoryId: text('category_id')
			.notNull()
			.references(() => skillCategoryTable.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		/**
		 * Holding this skill needs evidence: a CERTIFICATE document linked to it
		 * (candidate_document_uploads.skill_id) whose expiry has not passed. Without
		 * one the skill is still shown on the profile, flagged, but does NOT count
		 * toward a requisition's requirements. e.g. CPR/BLS.
		 */
		requiresCertificate: boolean('requires_certificate').notNull().default(false),
		archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' })
	},
	(t) => ({
		categoryIdx: index('skills_category_idx').on(t.categoryId),
		nameUnique: uniqueIndex('skills_category_name_unique').on(t.categoryId, sql`lower(${t.name})`)
	})
);

export const skillCategoryTable = pgTable(
	'skill_categories',
	{
		id: text('id').notNull().primaryKey(),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		name: text('name').notNull(),
		description: text('description'),
		sortOrder: integer('sort_order').notNull().default(0),
		archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' })
	},
	(t) => ({
		nameUnique: uniqueIndex('skill_categories_name_unique').on(sql`lower(${t.name})`)
	})
);

/**
 * Which disciplines a category applies to. NO rows for a category = it applies to
 * every discipline. Pickers (profile + requisition) only offer categories in scope
 * for the discipline(s) at hand.
 */
export const skillCategoryDisciplineTable = pgTable(
	'skill_category_disciplines',
	{
		categoryId: text('category_id')
			.notNull()
			.references(() => skillCategoryTable.id, { onDelete: 'cascade' }),
		disciplineId: text('discipline_id')
			.notNull()
			.references(() => disciplineTable.id, { onDelete: 'cascade' })
	},
	(t) => ({
		pk: primaryKey({ columns: [t.categoryId, t.disciplineId] }),
		disciplineIdx: index('skill_category_disciplines_discipline_idx').on(t.disciplineId)
	})
);

export const disciplineTable = pgTable('disciplines', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	name: text('name').notNull(),
	abbreviation: text('abbreviation').notNull(),
	// Does practising this discipline legally require a LICENSE? Admin-set once per
	// discipline — a fact about the discipline, true for everyone who holds it.
	//
	// Distinct from a CERTIFICATION, which varies by state and by person and so lives
	// on candidate_discipline_experience.requires_cert. Both gate job visibility when
	// their date lapses; neither gates merely by being absent — though a missing
	// LICENSE does block once its 30-day grace period runs out. See
	// src/lib/server/certifications/credentialStatus.ts.
	requiresLicense: boolean('requires_license').notNull().default(false)
});

export const experienceLevelTable = pgTable('experience_levels', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	value: text('value').notNull(),
	order: integer('order').notNull().default(0)
});

export type Skill = typeof skillTable.$inferInsert;
export type SkillCategory = typeof skillCategoryTable.$inferInsert;
export type Discipline = typeof disciplineTable.$inferInsert;
export type ExperienceLevel = typeof experienceLevelTable.$inferInsert;

export type SkillSelect = typeof skillTable.$inferSelect;
export type SkillCategorySelect = typeof skillCategoryTable.$inferSelect;

export type UpdateSkill = Partial<typeof skillTable.$inferInsert>;
export type UpdateSkillCategory = Partial<typeof skillCategoryTable.$inferInsert>;
export type UpdateDiscipline = Partial<typeof disciplineTable.$inferInsert>;
export type UpdateExperienceLevel = Partial<typeof experienceLevelTable.$inferInsert>;
