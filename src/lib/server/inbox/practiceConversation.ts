import { and, desc, eq, or } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { candidateBlacklistTable } from '$lib/server/database/schemas/candidate';
import { clientCompanyTable, clientProfileTable } from '$lib/server/database/schemas/client';
import {
	conversationParticipantsTable,
	conversationTable
} from '$lib/server/database/schemas/messages';
import {
	requisitionApplicationTable,
	requisitionTable,
	timeSheetTable
} from '$lib/server/database/schemas/requisition';
import { InboxService } from './service';

/**
 * The professional's newest open conversation with a practice: either a
 * CLIENT_CANDIDATE thread for that company, or an application thread on one of
 * its requests. Only threads the user is still an active participant in.
 */
export async function findPracticeConversationId({
	userId,
	companyId
}: {
	userId: string;
	companyId: string;
}): Promise<string | null> {
	const [row] = await db
		.select({ id: conversationTable.id })
		.from(conversationTable)
		.innerJoin(
			conversationParticipantsTable,
			and(
				eq(conversationParticipantsTable.conversationId, conversationTable.id),
				eq(conversationParticipantsTable.userId, userId),
				eq(conversationParticipantsTable.isActive, true)
			)
		)
		.leftJoin(
			requisitionApplicationTable,
			eq(conversationTable.applicationId, requisitionApplicationTable.id)
		)
		.leftJoin(requisitionTable, eq(requisitionApplicationTable.requisitionId, requisitionTable.id))
		.where(
			and(
				eq(conversationTable.isActive, true),
				or(eq(conversationTable.companyId, companyId), eq(requisitionTable.companyId, companyId))
			)
		)
		.orderBy(desc(conversationTable.updatedAt))
		.limit(1);

	return row?.id ?? null;
}

/**
 * Either side has ended the relationship: a practice block, or the
 * professional's own "wouldn't work here again" survey answer. Both write the
 * same row, so they can't be told apart; neither may start a new thread.
 */
export async function isBlockedFromPractice({
	candidateId,
	companyId
}: {
	candidateId: string;
	companyId: string;
}): Promise<boolean> {
	const [row] = await db
		.select({ candidateId: candidateBlacklistTable.candidateId })
		.from(candidateBlacklistTable)
		.where(
			and(
				eq(candidateBlacklistTable.candidateId, candidateId),
				eq(candidateBlacklistTable.companyId, companyId)
			)
		)
		.limit(1);
	return !!row;
}

export type StartPracticeConversationResult =
	| { ok: true; conversationId: string; created: boolean }
	| { ok: false; status: 403 | 404; message: string };

/**
 * A professional messages a practice they've worked for. Having a timesheet
 * with the practice is the proof of a working relationship, so the timesheet
 * must be theirs. Reuses an existing thread rather than opening a second one.
 * The practice owner is the other participant, matching how practices start
 * application threads.
 */
export async function startPracticeConversation({
	userId,
	candidateId,
	timesheetId,
	body
}: {
	userId: string;
	candidateId: string;
	timesheetId: string;
	body: string;
}): Promise<StartPracticeConversationResult> {
	const [sheet] = await db
		.select({ companyId: requisitionTable.companyId, ownerUserId: clientProfileTable.userId })
		.from(timeSheetTable)
		.innerJoin(requisitionTable, eq(timeSheetTable.requisitionId, requisitionTable.id))
		.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
		.innerJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.where(
			and(eq(timeSheetTable.id, timesheetId), eq(timeSheetTable.associatedCandidateId, candidateId))
		)
		.limit(1);

	if (!sheet?.companyId) return { ok: false, status: 404, message: 'Timesheet not found' };

	if (await isBlockedFromPractice({ candidateId, companyId: sheet.companyId })) {
		return { ok: false, status: 403, message: "You can't message this practice" };
	}

	const inbox = new InboxService();
	const existing = await findPracticeConversationId({ userId, companyId: sheet.companyId });
	if (existing) {
		await inbox.sendMessage({ conversationId: existing, senderId: userId, body });
		return { ok: true, conversationId: existing, created: false };
	}

	const conversationId = await inbox.createConversation({
		type: 'CLIENT_CANDIDATE',
		companyId: sheet.companyId,
		// The sender first: createConversation posts the initial message as them.
		participants: [
			{ userId, participantType: 'CANDIDATE' },
			{ userId: sheet.ownerUserId, participantType: 'CLIENT' }
		],
		initialMessage: body
	});
	return { ok: true, conversationId, created: true };
}
