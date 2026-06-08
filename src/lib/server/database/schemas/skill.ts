import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

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
	abbreviation: text('abbreviation').notNull()
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
