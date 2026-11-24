/**
 * Read side of the admin conversation log. Strictly read-only: unlike opening a
 * thread in the inbox, nothing here marks a message read or tells anyone.
 *
 * Every query keeps to conversations with at least one practice or professional
 * participant, so DTSS team members' chats with each other stay private.
 */
import type { PgSelect } from 'drizzle-orm/pg-core';
import { and, count, desc, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { clientCompanyTable } from '$lib/server/database/schemas/client';
import {
	conversationParticipantsTable,
	conversationTable,
	messageTable
} from '$lib/server/database/schemas/messages';
import { requisitionApplicationTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { disciplineTable } from '$lib/server/database/schemas/skill';
import { STAFF_ROLES } from '$lib/authz';
import {
	likePattern,
	type ConversationBetween,
	type ConversationLogFilters,
	type ConversationLogRow
} from '$features/inbox/conversationLog';
import { InboxService } from './service';

const PRACTICE_ROLES = ['CLIENT', 'CLIENT_STAFF'];
const PRO_ROLES = ['CANDIDATE'];

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(' ');

/** A participant of this conversation with one of these roles. */
function hasParticipant(roles: readonly string[], extra?: SQL) {
	return exists(
		db
			.select({ one: sql`1` })
			.from(conversationParticipantsTable)
			.innerJoin(userTable, eq(userTable.id, conversationParticipantsTable.userId))
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationTable.id),
					inArray(userTable.role, [...roles]),
					extra
				)
			)
	);
}

const BETWEEN: Record<ConversationBetween, () => SQL | undefined> = {
	PRACTICE_PRO: () => and(hasParticipant(PRACTICE_ROLES), hasParticipant(PRO_ROLES)),
	DTSS_PRACTICE: () => and(hasParticipant(STAFF_ROLES), hasParticipant(PRACTICE_ROLES)),
	DTSS_PRO: () => and(hasParticipant(STAFF_ROLES), hasParticipant(PRO_ROLES))
};

const outsideDtss = () => hasParticipant([...PRACTICE_ROLES, ...PRO_ROLES]);

const hasMessages = (extra?: SQL) =>
	exists(
		db
			.select({ one: sql`1` })
			.from(messageTable)
			.where(and(eq(messageTable.conversationId, conversationTable.id), extra))
	);

export async function getConversationLog(
	filters: ConversationLogFilters,
	{ page, pageSize }: { page: number; pageSize: number }
): Promise<{ rows: ConversationLogRow[]; total: number }> {
	const pattern = filters.search ? likePattern(filters.search) : null;
	const where = and(
		outsideDtss(),
		hasMessages(),
		filters.between ? BETWEEN[filters.between]() : undefined,
		pattern
			? or(
					hasMessages(ilike(messageTable.body, pattern)),
					hasParticipant(
						[...STAFF_ROLES, ...PRACTICE_ROLES, ...PRO_ROLES],
						or(
							ilike(sql`${userTable.firstName} || ' ' || ${userTable.lastName}`, pattern),
							ilike(userTable.email, pattern)
						)
					),
					ilike(clientCompanyTable.companyName, pattern)
				)
			: undefined
	);

	// The practice: named on the conversation, or through its application's request.
	const withContext = <T extends PgSelect>(query: T) =>
		query
			.leftJoin(requisitionApplicationTable, eq(requisitionApplicationTable.id, conversationTable.applicationId))
			.leftJoin(requisitionTable, eq(requisitionTable.id, requisitionApplicationTable.requisitionId))
			.leftJoin(disciplineTable, eq(disciplineTable.id, requisitionTable.disciplineId))
			.leftJoin(
				clientCompanyTable,
				eq(clientCompanyTable.id, sql`coalesce(${conversationTable.companyId}, ${requisitionTable.companyId})`)
			)
			.where(where);

	const [[{ total }], conversations] = await Promise.all([
		withContext(db.select({ total: count() }).from(conversationTable).$dynamic()),
		withContext(
			db
				.select({
					id: conversationTable.id,
					updatedAt: conversationTable.updatedAt,
					practiceName: clientCompanyTable.companyName,
					disciplineName: disciplineTable.name
				})
				.from(conversationTable)
				.$dynamic()
		)
			.orderBy(desc(conversationTable.updatedAt), desc(conversationTable.id))
			.limit(pageSize)
			.offset((page - 1) * pageSize)
	]);

	const ids = conversations.map((c) => c.id);
	if (ids.length === 0) return { rows: [], total };

	const [participants, counts, last] = await Promise.all([
		db
			.select({
				conversationId: conversationParticipantsTable.conversationId,
				userId: userTable.id,
				firstName: userTable.firstName,
				lastName: userTable.lastName,
				email: userTable.email,
				role: userTable.role
			})
			.from(conversationParticipantsTable)
			.innerJoin(userTable, eq(userTable.id, conversationParticipantsTable.userId))
			.where(inArray(conversationParticipantsTable.conversationId, ids)),
		db
			.select({ conversationId: messageTable.conversationId, n: count() })
			.from(messageTable)
			.where(inArray(messageTable.conversationId, ids))
			.groupBy(messageTable.conversationId),
		db
			.selectDistinctOn([messageTable.conversationId], {
				conversationId: messageTable.conversationId,
				body: messageTable.body,
				createdAt: messageTable.createdAt,
				firstName: userTable.firstName,
				lastName: userTable.lastName
			})
			.from(messageTable)
			.innerJoin(userTable, eq(userTable.id, messageTable.senderId))
			.where(inArray(messageTable.conversationId, ids))
			.orderBy(messageTable.conversationId, desc(messageTable.id))
	]);

	const rows = conversations.map((c): ConversationLogRow => {
		const message = last.find((m) => m.conversationId === c.id);
		return {
			...c,
			participants: participants
				.filter((p) => p.conversationId === c.id)
				.map((p) => ({ userId: p.userId, name: fullName(p.firstName, p.lastName) || p.email, role: p.role })),
			messageCount: counts.find((n) => n.conversationId === c.id)?.n ?? 0,
			lastMessage: message
				? { body: message.body, createdAt: message.createdAt, senderName: fullName(message.firstName, message.lastName) }
				: null
		};
	});
	return { rows, total };
}

/** One whole conversation, or null when it doesn't exist or is DTSS team only. */
export async function getConversationForReview(conversationId: string, viewerId: string) {
	const [allowed] = await db
		.select({ id: conversationTable.id })
		.from(conversationTable)
		.where(and(eq(conversationTable.id, conversationId), eq(conversationTable.isActive, true), outsideDtss()))
		.limit(1);
	if (!allowed) return null;

	const [conversation, roles] = await Promise.all([
		// Reads only; marking read is the inbox page's own separate call.
		new InboxService().getConversationDetails(conversationId, viewerId),
		db
			.select({ userId: userTable.id, role: userTable.role })
			.from(conversationParticipantsTable)
			.innerJoin(userTable, eq(userTable.id, conversationParticipantsTable.userId))
			.where(eq(conversationParticipantsTable.conversationId, conversationId))
	]);

	// Only what the transcript shows: the thread query also carries whole
	// requisition and company rows.
	const requisition = conversation.applicationData?.requisition;
	return {
		id: conversation.id,
		createdAt: conversation.createdAt,
		participants: conversation.participants.map((p) => ({
			userId: p.userId,
			name: fullName(p.firstName, p.lastName) || p.email,
			email: p.email,
			role: roles.find((r) => r.userId === p.userId)?.role ?? p.participantType,
			avatarUrl: p.avatarUrl
		})),
		practiceName: conversation.practice?.name ?? conversation.applicationData?.company?.companyName ?? null,
		disciplineName: (requisition as { disciplineName?: string | null } | null | undefined)?.disciplineName ?? null,
		requisitionId: requisition?.id ?? null,
		messages: conversation.messages.map((m) => ({
			id: m.id,
			body: m.body,
			createdAt: m.createdAt,
			editedAt: m.editedAt,
			isSystemMessage: m.isSystemMessage,
			senderId: m.senderId,
			senderName: fullName(m.firstName, m.lastName),
			avatarUrl: m.avatarUrl
		}))
	};
}

export type ConversationReview = NonNullable<Awaited<ReturnType<typeof getConversationForReview>>>;
