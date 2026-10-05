import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const skillTable = pgTable('skills', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	categoryId: text('category_id')
		.notNull()
		.references(() => skillCategoryTable.id, { onDelete: 'cascade' }),
	name: text('name').notNull()
});

export const skillCategoryTable = pgTable('skill_categories', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	name: text('name').notNull()
});

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

export type UpdateSkill = Partial<typeof skillTable.$inferInsert>;
export type UpdateSkillCategory = Partial<typeof skillCategoryTable.$inferInsert>;
export type UpdateDiscipline = Partial<typeof disciplineTable.$inferInsert>;
export type UpdateExperienceLevel = Partial<typeof experienceLevelTable.$inferInsert>;
