import { and, desc, eq, isNull, or } from 'drizzle-orm';
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
	timeSheetTable,
	workdayTable
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

/** What ties the professional to the practice: their timesheet, or a shift they hold. */
export type PracticeLink = { timesheetId: string } | { workdayId: string };

/** The practice behind a timesheet or claimed shift, only when it's this professional's. */
async function practiceFor(candidateId: string, link: PracticeLink) {
	const practice = { companyId: requisitionTable.companyId, ownerUserId: clientProfileTable.userId };
	const [row] =
		'timesheetId' in link
			? await db
					.select(practice)
					.from(timeSheetTable)
					.innerJoin(requisitionTable, eq(timeSheetTable.requisitionId, requisitionTable.id))
					.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
					.innerJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
					.where(
						and(
							eq(timeSheetTable.id, link.timesheetId),
							eq(timeSheetTable.associatedCandidateId, candidateId)
						)
					)
					.limit(1)
			: await db
					.select(practice)
					.from(workdayTable)
					.innerJoin(requisitionTable, eq(workdayTable.requisitionId, requisitionTable.id))
					.innerJoin(clientCompanyTable, eq(requisitionTable.companyId, clientCompanyTable.id))
					.innerJoin(clientProfileTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
					.where(
						and(
							eq(workdayTable.id, link.workdayId),
							eq(workdayTable.candidateId, candidateId),
							// A cancelled shift is no longer theirs.
							isNull(workdayTable.cancelledAt)
						)
					)
					.limit(1);
	return row ?? null;
}

/**
 * A professional messages a practice they've worked for or claimed a shift
 * with. Their timesheet or their shift is the proof of the relationship, so it
 * must be theirs. Reuses an existing thread rather than opening a second one.
 * The practice owner is the other participant, matching how practices start
 * application threads.
 */
export async function startPracticeConversation({
	userId,
	candidateId,
	link,
	body
}: {
	userId: string;
	candidateId: string;
	link: PracticeLink;
	body: string;
}): Promise<StartPracticeConversationResult> {
	const practice = await practiceFor(candidateId, link);
	if (!practice?.companyId) {
		return {
			ok: false,
			status: 404,
			message: 'timesheetId' in link ? 'Timesheet not found' : 'Shift not found'
		};
	}

	if (await isBlockedFromPractice({ candidateId, companyId: practice.companyId })) {
		return { ok: false, status: 403, message: "You can't message this practice" };
	}

	const inbox = new InboxService();
	const existing = await findPracticeConversationId({ userId, companyId: practice.companyId });
	if (existing) {
		await inbox.sendMessage({ conversationId: existing, senderId: userId, body });
		return { ok: true, conversationId: existing, created: false };
	}

	const conversationId = await inbox.createConversation({
		type: 'CLIENT_CANDIDATE',
		companyId: practice.companyId,
		// The sender first: createConversation posts the initial message as them.
		participants: [
			{ userId, participantType: 'CANDIDATE' },
			{ userId: practice.ownerUserId, participantType: 'CLIENT' }
		],
		initialMessage: body
	});
	return { ok: true, conversationId, created: true };
}
