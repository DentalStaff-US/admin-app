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
	// Does practising this discipline require a certification or registration that
	// expires? Admin-set once per discipline (admin/menu/disciplines) — it is a fact
	// about the discipline, not a per-professional opinion, so it is NOT stored on
	// candidate_discipline_experience.
	//
	// Drives enforcement: a professional's linked credential only gates job
	// visibility when this is true, so flipping it off is a per-discipline kill
	// switch. Also drives the MISSING state (flag on, no credential uploaded),
	// which warns and chases but deliberately does NOT hide jobs.
	// See src/lib/server/certifications/certStatus.ts.
	requiresCertification: boolean('requires_certification').notNull().default(false)
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
