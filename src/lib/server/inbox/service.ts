import { and, desc, asc, eq, gt, sql, inArray, count } from 'drizzle-orm';
import db from '../database/drizzle';
import {
	conversationTable,
	messageTable,
	conversationParticipantsTable,
	type Message
} from '../database/schemas/messages';
import { messageQuerySchema, type ConversationType, type ParticipantType } from '.';
import type { z } from 'zod';
import { getUserById } from '../database/queries/users';
import { userTable } from '../database/schemas/auth';
import { requisitionApplicationTable, requisitionTable } from '../database/schemas/requisition';
import { clientCompanyTable } from '../database/schemas/client';
import { disciplineTable } from '../database/schemas/skill';
import { error } from '@sveltejs/kit';

export class InboxService {
	// Conversation Management
	async createConversation({
		type,
		participants,
		applicationId,
		initialMessage
	}: {
		type: ConversationType;
		participants: { userId: string; participantType: ParticipantType }[];
		applicationId?: string;
		initialMessage?: string;
	}) {
		console.log(
			`Creating conversation with data: ${JSON.stringify({ type, participants, applicationId })}`
		);
		const conversationId = crypto.randomUUID();

		await db.transaction(async (tx) => {
			// Create conversation
			await tx.insert(conversationTable).values({
				id: conversationId,
				type,
				applicationId,
				isActive: true
			});

			// Add participants
			await tx.insert(conversationParticipantsTable).values(
				participants.map((p) => ({
					conversationId,
					userId: p.userId,
					participantType: p.participantType,
					isActive: true
				}))
			);

			// Add initial message if provided
			if (initialMessage) {
				await tx.insert(messageTable).values({
					conversationId,
					body: initialMessage,
					senderId: participants[0].userId,
					isSystemMessage: false
				});
			}
		});

		return conversationId;
	}

	async getConversations(userId: string) {
		// Get all active conversations for user
		const conversations = await db
			.select()
			.from(conversationTable)
			.innerJoin(
				conversationParticipantsTable,
				eq(conversationTable.id, conversationParticipantsTable.conversationId)
			)
			.where(
				and(
					eq(conversationParticipantsTable.userId, userId),
					eq(conversationParticipantsTable.isActive, true),
					eq(conversationTable.isActive, true)
				)
			)
			.orderBy(desc(conversationTable.updatedAt));

		// Get all details for each conversation
		const enhancedConversations = await Promise.all(
			conversations.map(async (conv) => {
				// Get participants with user details
				const participants = await db
					.select({
						userId: conversationParticipantsTable.userId,
						participantType: conversationParticipantsTable.participantType
					})
					.from(conversationParticipantsTable)
					.where(eq(conversationParticipantsTable.conversationId, conv.conversations.id));

				// Get user data for all participants
				const enhancedParticipants = await Promise.all(
					participants.map(async (p) => {
						const userFromParticipant = await getUserById(p.userId);
						return {
							...p,
							...userFromParticipant
						};
					})
				);

				// Get last message and unread count
				const [lastMessage, unreadCount] = await Promise.all([
					this.getLastMessage(conv.conversations.id),
					this.getUnreadCount(conv.conversations.id, userId)
				]);

				// Get application, requisition, and company data if this is an application conversation
				let applicationData = null;
				if (conv.conversations.type === 'APPLICATION' && conv.conversations.applicationId) {
					const application = await db
						.select()
						.from(requisitionApplicationTable)
						.where(eq(requisitionApplicationTable.id, conv.conversations.applicationId))
						.limit(1)
						.then((rows) => rows[0]);

					if (application) {
						// Get requisition with company + discipline data. `title` is a
						// deprecated column on requisitions — use `disciplineName` for display.
						const requisitionWithCompany = await db
							.select({
								requisition: {
									id: requisitionTable.id,
									title: requisitionTable.title,
									disciplineName: disciplineTable.name,
									status: requisitionTable.status,
									companyId: requisitionTable.companyId
								},
								company: {
									id: clientCompanyTable.id,
									name: clientCompanyTable.companyName,
									logo: clientCompanyTable.companyLogo
								}
							})
							.from(requisitionTable)
							.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
							.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
							.where(eq(requisitionTable.id, application.requisitionId))
							.limit(1)
							.then((rows) => rows[0]);

						applicationData = {
							application: {
								id: application.id,
								status: application.status,
								createdAt: application.createdAt,
								updatedAt: application.updatedAt
							},
							requisition: requisitionWithCompany?.requisition || null,
							company: requisitionWithCompany?.company || null
						};
					}
				}

				return {
					...conv.conversations,
					participants: enhancedParticipants,
					lastMessage,
					unreadCount,
					applicationData
				};
			})
		);

		return enhancedConversations;
	}

	async findExistingConversation({
		contextId,
		contextType,
		participantIds
	}: {
		contextId?: string;
		contextType?: ConversationType;
		participantIds: string[];
	}): Promise<{ exists: boolean; conversationId?: string }> {
		// Create an array of conditions
		const conditions = [eq(conversationTable.isActive, true)];

		// Add conditional filters
		if (contextId) {
			conditions.push(eq(conversationTable.applicationId, contextId));
		}

		if (contextType) {
			conditions.push(eq(conversationTable.type, contextType));
		}

		// Execute query with all conditions
		const conversations = await db
			.select({ id: conversationTable.id })
			.from(conversationTable)
			.where(and(...conditions));

		if (conversations.length === 0) {
			return { exists: false };
		}

		console.log({ conversations });

		// Check participants for these conversations
		const conversationIds = conversations.map((c) => c.id);
		const participants = await db
			.select({
				conversationId: conversationParticipantsTable.conversationId,
				userId: conversationParticipantsTable.userId
			})
			.from(conversationParticipantsTable)
			.where(
				and(
					inArray(conversationParticipantsTable.conversationId, conversationIds),
					inArray(conversationParticipantsTable.userId, participantIds),
					eq(conversationParticipantsTable.isActive, true)
				)
			);

		// Group and check participants
		const conversationsMap = participants.reduce(
			(acc, p) => {
				if (!acc[p.conversationId]) {
					acc[p.conversationId] = new Set();
				}
				acc[p.conversationId].add(p.userId);
				return acc;
			},
			{} as Record<string, Set<string>>
		);

		console.log({ conversationsMap });

		// Find first conversation with all required participants
		const matchingConversationId = Object.entries(conversationsMap).find(([_, users]) =>
			participantIds.every((id) => users.has(id))
		)?.[0];

		return {
			exists: !!matchingConversationId,
			conversationId: matchingConversationId
		};
	}

	async sendMessage({
		conversationId,
		senderId,
		body,
		isSystemMessage = false
	}: {
		conversationId: string;
		senderId: string;
		body: string;
		isSystemMessage?: boolean;
	}) {
		// Insert message
		const [message] = await db
			.insert(messageTable)
			.values({
				conversationId,
				senderId,
				body,
				isSystemMessage
			})
			.returning({ id: messageTable.id });

		// Update conversation
		await db
			.update(conversationTable)
			.set({
				lastMessageId: message.id,
				updatedAt: new Date()
			})
			.where(eq(conversationTable.id, conversationId));

		return message.id;
	}

	async getMessages(input: z.infer<typeof messageQuerySchema>): Promise<Message[]> {
		const params = messageQuerySchema.parse(input);

		// Construct conditions
		const conditions = [eq(messageTable.conversationId, params.conversationId)];

		if (params.beforeId) {
			conditions.push(gt(messageTable.id, params.beforeId));
		}

		// Construct and execute query
		const messages = await db
			.select()
			.from(messageTable)
			.where(and(...conditions))
			.orderBy(desc(messageTable.createdAt))
			.limit(params.limit);

		return messages;
	}

	async getConversationDetails(conversationId: string | undefined, userId: string | undefined) {
		if (!conversationId || !userId) throw error(500, 'Missing request parameters');

		const [conversation, participants, messages, unreadCount] = await Promise.all([
			// Get conversation
			db
				.select({
					id: conversationTable.id,
					type: conversationTable.type,
					createdAt: conversationTable.createdAt,
					updatedAt: conversationTable.updatedAt,
					isActive: conversationTable.isActive,
					applicationId: conversationTable.applicationId
				})
				.from(conversationTable)
				.where(and(eq(conversationTable.id, conversationId), eq(conversationTable.isActive, true)))
				.limit(1)
				.then((rows) => rows[0]),

			// Get participants with user details
			db
				.select({
					userId: conversationParticipantsTable.userId,
					participantType: conversationParticipantsTable.participantType,
					joinedAt: conversationParticipantsTable.joinedAt,
					isActive: conversationParticipantsTable.isActive,
					email: userTable.email,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				})
				.from(conversationParticipantsTable)
				.innerJoin(userTable, eq(conversationParticipantsTable.userId, userTable.id))
				.where(eq(conversationParticipantsTable.conversationId, conversationId)),

			// Get messages with sender details
			db
				.select({
					id: messageTable.id,
					body: messageTable.body,
					createdAt: messageTable.createdAt,
					editedAt: messageTable.editedAt,
					isSystemMessage: messageTable.isSystemMessage,
					status: messageTable.status,
					senderId: messageTable.senderId,
					firstName: userTable.firstName,
					lastName: userTable.lastName,
					avatarUrl: userTable.avatarUrl
				})
				.from(messageTable)
				.innerJoin(userTable, eq(messageTable.senderId, userTable.id))
				.where(eq(messageTable.conversationId, conversationId))
				.orderBy(asc(messageTable.createdAt)),

			// Get unread count
			this.getUnreadCount(conversationId, userId)
		]);

		if (!conversation) {
			throw new Error('Conversation not found');
		}

		// Get application, requisition, and company data if this is an application conversation
		let applicationData = null;
		if (conversation.type === 'APPLICATION' && conversation.applicationId) {
			const application = await db
				.select()
				.from(requisitionApplicationTable)
				.where(eq(requisitionApplicationTable.id, conversation.applicationId))
				.limit(1)
				.then((rows) => rows[0]);

			if (application) {
				// Get requisition with company + discipline data. `title` is a
				// deprecated column on requisitions — use `disciplineName` for display.
				const requisitionWithCompany = await db
					.select({
						requisition: {
							...requisitionTable,
							disciplineName: disciplineTable.name
						},
						company: {
							...clientCompanyTable
						}
					})
					.from(requisitionTable)
					.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
					.innerJoin(disciplineTable, eq(requisitionTable.disciplineId, disciplineTable.id))
					.where(eq(requisitionTable.id, application.requisitionId))
					.limit(1)
					.then((rows) => rows[0]);

				applicationData = {
					application: {
						id: application.id,
						status: application.status,
						createdAt: application.createdAt,
						updatedAt: application.updatedAt
					},
					requisition: requisitionWithCompany?.requisition || null,
					company: requisitionWithCompany?.company || null
				};
			}
		}

		return {
			...conversation,
			participants,
			messages,
			unreadCount,
			applicationData
		};
	}

	async addParticipant({
		conversationId,
		userId,
		participantType
	}: {
		conversationId: string;
		userId: string;
		participantType: ParticipantType;
	}) {
		await db.insert(conversationParticipantsTable).values({
			conversationId,
			userId,
			participantType,
			isActive: true
		});

		// Add system message
		await this.sendMessage({
			conversationId,
			senderId: userId,
			body: `User ${userId} joined the conversation`,
			isSystemMessage: true
		});
	}

	async removeParticipant(conversationId: string, userId: string) {
		await db
			.update(conversationParticipantsTable)
			.set({
				isActive: false,
				leftAt: new Date()
			})
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationId),
					eq(conversationParticipantsTable.userId, userId)
				)
			);

		await this.sendMessage({
			conversationId,
			senderId: userId,
			body: `User ${userId} left the conversation`,
			isSystemMessage: true
		});
	}

	async markAsRead(conversationId: string, userId: string, messageId: number) {
		await db
			.update(conversationParticipantsTable)
			.set({ latestMessageId: messageId })
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationId),
					eq(conversationParticipantsTable.userId, userId)
				)
			);
	}

	async getUnreadCount(conversationId: string, userId: string) {
		const participant = await db
			.select()
			.from(conversationParticipantsTable)
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationId),
					eq(conversationParticipantsTable.userId, userId)
				)
			)
			.then((rows) => rows[0]);

		if (!participant) return 0;

		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(messageTable)
			.where(
				and(
					eq(messageTable.conversationId, conversationId),
					gt(messageTable.id, participant.latestMessageId ?? 0)
				)
			);

		return result[0]?.count ?? 0;
	}

	async getTotalUnreadCount(userId: string) {
		const conversations = await db
			.select({
				conversationId: conversationParticipantsTable.conversationId,
				latestMessageId: conversationParticipantsTable.latestMessageId
			})
			.from(conversationParticipantsTable)
			.where(
				and(
					eq(conversationParticipantsTable.userId, userId),
					eq(conversationParticipantsTable.isActive, true)
				)
			);
		if (conversations.length === 0) return 0;
		const conversationIds = conversations.map((c) => c.conversationId);
		const latestMessageIds = conversations.map((c) => c.latestMessageId ?? 0);
		const result = await db
			.select({ count: count() })
			.from(messageTable)
			.where(
				and(
					inArray(messageTable.conversationId, conversationIds),
					gt(
						messageTable.id,
						sql`ANY(ARRAY[
					${latestMessageIds.join(',')}
					]
					:
					:
					int
					[
					]
					)`
					)
				)
			);
		return result[0]?.count ?? 0;
	}

	private async getLastMessage(conversationId: string) {
		return await db
			.select({
				id: messageTable.id,
				body: messageTable.body,
				senderId: messageTable.senderId,
				createdAt: messageTable.createdAt
			})
			.from(messageTable)
			.where(eq(messageTable.conversationId, conversationId))
			.orderBy(desc(messageTable.createdAt))
			.limit(1)
			.then((rows) => rows[0]);
	}

	async getApplicationConversations(applicationId: string) {
		const conversations = await db
			.select()
			.from(conversationTable)
			.where(
				and(
					eq(conversationTable.applicationId, applicationId),
					eq(conversationTable.isActive, true)
				)
			);

		return Promise.all(
			conversations.map(async (conv) => {
				const participants = await db
					.select({
						userId: conversationParticipantsTable.userId,
						participantType: conversationParticipantsTable.participantType
					})
					.from(conversationParticipantsTable)
					.where(eq(conversationParticipantsTable.conversationId, conv.id));

				return {
					...conv,
					participants
				};
			})
		);
	}

	async searchMessages(
		userId: string,
		query: string,
		options: {
			conversationType?: ConversationType;
			participantId?: string;
			startDate?: Date;
			endDate?: Date;
		} = {}
	) {
		const conditions = [
			sql`${messageTable.body}
		ILIKE
		${`%${query}%`}`
		];

		// Get conversations the user is part of
		const userConversations = await db
			.select({ conversationId: conversationParticipantsTable.conversationId })
			.from(conversationParticipantsTable)
			.where(eq(conversationParticipantsTable.userId, userId));

		conditions.push(
			sql`${messageTable.conversationId}
			IN
			${userConversations.map((c) => c.conversationId)}`
		);

		if (options.conversationType) {
			conditions.push(sql`${conversationTable.type}
			=
			${options.conversationType}`);
		}

		if (options.participantId) {
			conditions.push(sql`${messageTable.senderId}
			=
			${options.participantId}`);
		}

		if (options.startDate) {
			conditions.push(sql`${messageTable.createdAt}
			>=
			${options.startDate}`);
		}

		if (options.endDate) {
			conditions.push(sql`${messageTable.createdAt}
			<=
			${options.endDate}`);
		}

		return await db
			.select()
			.from(messageTable)
			.innerJoin(conversationTable, eq(messageTable.conversationId, conversationTable.id))
			.where(and(...conditions))
			.orderBy(desc(messageTable.createdAt));
	}
}
