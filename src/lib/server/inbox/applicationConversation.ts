import { and, desc, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	conversationParticipantsTable,
	conversationTable
} from '$lib/server/database/schemas/messages';
import { requisitionApplicationTable } from '$lib/server/database/schemas/requisition';

/**
 * The professional's open conversation with the practice about one job, if
 * there is one. Conversations hang off the application, so this goes through
 * the candidate's application to the requisition, and only returns threads
 * the user is still an active participant in. Null when none exists:
 * professionals can't start a conversation themselves.
 */
export async function findApplicationConversationId({
	userId,
	candidateId,
	requisitionId
}: {
	userId: string;
	candidateId: string;
	requisitionId: number;
}): Promise<string | null> {
	const [row] = await db
		.select({ id: conversationTable.id })
		.from(conversationTable)
		.innerJoin(
			requisitionApplicationTable,
			eq(conversationTable.applicationId, requisitionApplicationTable.id)
		)
		.innerJoin(
			conversationParticipantsTable,
			and(
				eq(conversationParticipantsTable.conversationId, conversationTable.id),
				eq(conversationParticipantsTable.userId, userId),
				eq(conversationParticipantsTable.isActive, true)
			)
		)
		.where(
			and(
				eq(conversationTable.isActive, true),
				eq(requisitionApplicationTable.requisitionId, requisitionId),
				eq(requisitionApplicationTable.candidateId, candidateId)
			)
		)
		.orderBy(desc(conversationTable.updatedAt))
		.limit(1);

	return row?.id ?? null;
}
