import { boolean, jsonb, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { userTable } from './auth';
import { candidateProfileTable } from './candidate';
import { clientCompanyTable, clientProfileTable } from './client';

export const adminNoteTable = pgTable('admin_notes', {
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
	title: text('title').notNull(),
	createdById: text('created_by_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	forUserId: text('for_user_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	body: text('body').notNull()
});

export const adminNoteCommentsTable = pgTable('admin_note_comments', {
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
	adminNoteId: text('admin_note_id')
		.notNull()
		.references(() => adminNoteTable.id, { onDelete: 'cascade' }),
	createdById: text('created_by_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	body: text('body').notNull()
});

export const adminProfileCommentTable = pgTable('admin_profile_comments', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	body: text('body').notNull(),
	authorId: text('author_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	candidateId: text('candidate_id').references(() => candidateProfileTable.id, {
		onDelete: 'cascade'
	}),
	clientId: text('client_id').references(() => clientProfileTable.id, { onDelete: 'cascade' })
});

export const supportTicketStatusEnum = pgEnum('support_ticket_status', [
	'NEW',
	'PENDING',
	'CLOSED'
]);

export const supportTicketTable = pgTable('support_tickets', {
	id: text('id').notNull().primaryKey(),
	// Human-friendly sequential reference. The UUID `id` stays the canonical key
	// (used in routes/links); `ticketNumber` is the short number shown in the UI
	// (e.g. "Ticket #42"). Serial → Postgres auto-assigns on insert and, when the
	// column is added to the existing table, backfills current rows and continues
	// forward. DB-owned, so it's optional on insert ($inferInsert).
	ticketNumber: serial('ticket_number').notNull().unique(),
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
	closedAt: timestamp('closed_at', {
		withTimezone: true,
		mode: 'date'
	}),
	additionalNotes: text('additional_notes'),
	closedById: text('closed_by_id').references(() => userTable.id, { onDelete: 'set null' }),
	reportedById: text('reported_by')
		.notNull()
		.references(() => userTable.id, { onDelete: 'cascade' }),
	resolutionDetails: text('resolution_details'),
	stepsToReproduce: text('steps_to_reproduce'),
	expectedResult: text('expected_result'),
	actualResults: text('actual_result'),
	status: supportTicketStatusEnum('status').default('NEW'),
	title: text('title').notNull()
});

export const supportTicketCommentTable = pgTable('support_ticket_comments', {
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
	supportTicketId: text('support_ticket_id')
		.notNull()
		.references(() => supportTicketTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	fromId: text('from_id')
		.notNull()
		.references(() => userTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
	body: text('comment_body').notNull()
});

export const actionHistoryTable = pgTable('action_history', {
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
	entityId: text('entity_id').notNull(),
	entityType: text('entity_type').notNull(),
	// Nullable + SET NULL so deleting a user preserves the audit row (entity,
	// before/after, timestamp all intact) — only the attributed user is dropped.
	userId: text('user_id').references(() => userTable.id, { onDelete: 'set null' }),
	action: text('action').notNull(),
	changes: jsonb('changes').$type<{
		before?: Record<string, any>;
		after?: Record<string, any>;
	}>(),
	metadata: jsonb('metadata').$type<Record<string, any>>().default({})
});

export type AdminNote = typeof adminNoteTable.$inferInsert;
export type UpdateAdminNote = Partial<typeof adminNoteTable.$inferInsert>;
export type AdminNoteComment = typeof adminNoteCommentsTable.$inferInsert;
export type UpdateAdminNoteComment = Partial<typeof adminNoteCommentsTable.$inferInsert>;
export type SupportTicket = typeof supportTicketTable.$inferInsert;
export type UpdateSuportTicket = Partial<typeof supportTicketTable.$inferInsert>;
export type SupportTicketComment = typeof supportTicketCommentTable.$inferInsert;
export type UpdateSuportTicketComment = Partial<typeof supportTicketCommentTable.$inferInsert>;
export type ActionHistory = typeof actionHistoryTable.$inferInsert;
export type AdminProfileComment = typeof adminProfileCommentTable.$inferInsert;
export type AdminProfileCommentSelect = typeof adminProfileCommentTable.$inferSelect;
