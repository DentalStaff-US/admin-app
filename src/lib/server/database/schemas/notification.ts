// lib/notifications/schema.ts
import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { userTable } from './auth';

export const externalNotificationTypeEnum = pgEnum('notification_type', ['EMAIL', 'SMS']);

export const notificationStatusEnum = pgEnum('in_app_notification_status', [
	'UNREAD',
	'READ',
]);

export const externalNotificationTemplatesTable = pgTable('notification_templates', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	type: externalNotificationTypeEnum('type').notNull(),
	template: text('template').notNull(),
	requiredSources: jsonb('required_sources').notNull(),
	// Email specific fields
	emailSubject: text('email_subject'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	createdBy: text('created_by').notNull()
});

export const inAppNotificationsTable = pgTable('in_app_notifications', {
	id: uuid('id').primaryKey(),
	userId: text('user_id')
		.references(() => userTable.id, { onDelete: 'cascade' })
		.notNull(),
	message: text('message').notNull(),
	status: notificationStatusEnum('status').default('UNREAD').notNull(),
	resourceUrl: text('resource_url').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	readAt: timestamp('read_at', { withTimezone: true }),
	batchId: text('batch_id'),
});

// Schema types
export const insertTemplateSchema = createInsertSchema(externalNotificationTemplatesTable);
export const selectTemplateSchema = createSelectSchema(externalNotificationTemplatesTable);
export const insertNotificationSchema = createInsertSchema(inAppNotificationsTable);
export const selectNotificationSchema = createSelectSchema(inAppNotificationsTable);

export type InAppNotificationSelect = typeof inAppNotificationsTable.$inferSelect;
export type NewInAppNotification = typeof inAppNotificationsTable.$inferInsert;

export type ExternalNotificationTemplateSelect = typeof externalNotificationTemplatesTable.$inferSelect;
export type NewExternalNotificationTemplate =
	typeof externalNotificationTemplatesTable.$inferInsert;

export type ExternalNotificationType = 'EMAIL' | 'SMS';
