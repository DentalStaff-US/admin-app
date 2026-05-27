import {
	pgTable,
	text,
	timestamp,
	integer,
	serial,
	pgEnum,
	primaryKey,
	boolean,
	index
} from 'drizzle-orm/pg-core';
import { userRolesEnum, userTable } from './auth';
import { desc, sql } from 'drizzle-orm';
import { requisitionApplicationTable } from './requisition';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// Enums remain the same
export const messageStatusEnum = pgEnum('message_status', ['READ', 'UNREAD']);
export const participantTypeEnum = userRolesEnum;
export const conversationTypeEnum = pgEnum('conversation_type', [
	'INTERNAL',
	'APPLICATION',
	'ADMIN_CLIENT',
	'ADMIN_CANDIDATE'
]);

// Core conversation table with indexes
export const conversationTable = pgTable(
	'conversations',
	{
		id: text('id').notNull().primaryKey(),
		type: conversationTypeEnum('type').notNull(),
		applicationId: text('application_id').references(() => requisitionApplicationTable.id, {
			onDelete: 'cascade'
		}),
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
		lastMessageId: integer('last_message_id'),
		isActive: boolean('is_active').notNull().default(true)
	},
	(table) => ({
		typeIdx: index('conversation_type_idx').on(table.type),
		applicationIdx: index('conversation_application_idx').on(table.applicationId),
		updatedAtIdx: index('conversation_updated_at_idx').on(desc(table.updatedAt))
	})
);

// Messages table with indexes
export const messageTable = pgTable(
	'messages',
	{
		id: serial('id').notNull().primaryKey(),
		conversationId: text('conversation_id')
			.references(() => conversationTable.id, { onDelete: 'cascade' })
			.notNull(),
		senderId: text('sender_id')
			.references(() => userTable.id, { onDelete: 'cascade' })
			.notNull(),
		body: text('body').notNull(),
		status: messageStatusEnum('status').default('UNREAD'),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		editedAt: timestamp('edited_at', {
			withTimezone: true,
			mode: 'date'
		}),
		isSystemMessage: boolean('is_system_message').default(false)
	},
	(table) => ({
		// Composite index for conversation messages ordered by timestamp
		conversationTimestampIdx: index('message_conversation_timestamp_idx').on(
			table.conversationId,
			desc(table.createdAt)
		),
		senderIdx: index('message_sender_idx').on(table.senderId)
	})
);

// Participants table with indexes
export const conversationParticipantsTable = pgTable(
	'conversation_participants',
	{
		conversationId: text('conversation_id')
			.references(() => conversationTable.id, { onDelete: 'cascade' })
			.notNull(),
		userId: text('user_id')
			.references(() => userTable.id, { onDelete: 'cascade' })
			.notNull(),
		participantType: participantTypeEnum('participant_type').notNull(),
		joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
		leftAt: timestamp('left_at', { withTimezone: true }),
		isActive: boolean('is_active').notNull().default(true),
		latestMessageId: integer('last_read_message_id').references(() => messageTable.id)
	},
	(table) => ({
		pk: primaryKey({ columns: [table.conversationId, table.userId] }),
		// Composite index for user-type combinations
		userTypeIdx: index('participant_user_type_idx').on(table.userId, table.participantType),
		// Partial index for active conversations
		activeConversationsIdx: index('participant_active_conversations_idx')
			.on(table.userId)
			.where(sql`${table.isActive} = true`)
	})
);

// Schema types for messages
export const insertMessageSchema = createInsertSchema(messageTable);
export const selectMessageSchema = createSelectSchema(messageTable);

// Schema types for conversations
export const insertConversationSchema = createInsertSchema(conversationTable);
export const selectConversationSchema = createSelectSchema(conversationTable);

// Schema types for conversation participants
export const insertParticipantSchema = createInsertSchema(conversationParticipantsTable);
export const selectParticipantSchema = createSelectSchema(conversationParticipantsTable);

// Inferred types for messages
export type Message = typeof messageTable.$inferSelect;
export type NewMessage = typeof messageTable.$inferInsert;

// Inferred types for conversations
export type Conversation = typeof conversationTable.$inferSelect;
export type NewConversation = typeof conversationTable.$inferInsert;

// Inferred types for participants
export type ConversationParticipant = typeof conversationParticipantsTable.$inferSelect;
export type NewConversationParticipant = typeof conversationParticipantsTable.$inferInsert;
