/**
 * Account lifecycle actions for the admin user page: switch a practice owner to
 * a professional (or back), anonymize, hard-delete, sign out everywhere.
 *
 * Each runs in one transaction with the user row locked, re-checks its guard
 * inside it, and writes its ledger row there too. Stored files are removed
 * after the commit, best effort (deleteStoredObjects logs what it couldn't).
 *
 * The Better Auth user (id, email, password, verified email) survives a role
 * switch: only role and the onboarding flags change, and the person signs back
 * in with the same credentials.
 */
import { and, eq, inArray, ne } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { recordAction } from '$lib/server/audit/audit';
import {
	accountTable,
	sessionTable,
	twoFactorTable,
	userTable
} from '$lib/server/database/schemas/auth';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { clientProfileTable, clientStaffProfileTable } from '$lib/server/database/schemas/client';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import {
	conversationParticipantsTable,
	conversationTable,
	messageTable
} from '$lib/server/database/schemas/messages';
import { deleteUsersWithoutRecords } from '$lib/server/database/queries/admin';
import { deleteStoredObjects } from '$lib/server/uploads';
import {
	anonymizedEmail,
	isAnonymized,
	KEPT_DOCUMENT_TYPES,
	roleSwitchBlockers,
	roleSwitchTarget,
	switchRemovals,
	type SwitchableRole
} from '$features/admin/components/people/accountControls';
import {
	avatarKey,
	countAccountRecords,
	practiceFileKeys,
	professionalFileKeys,
	professionalProfileIds
} from './records';

/** A refusal with the HTTP status the action should answer with. */
export class AccountActionError extends Error {
	constructor(
		public status: 400 | 404 | 409,
		message: string
	) {
		super(message);
		this.name = 'AccountActionError';
	}
}

function joinList(items: string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

async function lockUser(tx: Tx, userId: string) {
	const [user] = await tx
		.select({ id: userTable.id, role: userTable.role, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.for('update');
	if (!user) throw new AccountActionError(404, 'User not found.');
	return user as { id: string; role: string; email: string };
}

/**
 * The user's conversations as a practice or professional (every type but
 * INTERNAL). Deleting one takes its messages and participants with it.
 */
async function deleteRoleConversations(tx: Tx, userId: string): Promise<number> {
	const rows: { id: string }[] = await tx
		.selectDistinct({ id: conversationParticipantsTable.conversationId })
		.from(conversationParticipantsTable)
		.innerJoin(conversationTable, eq(conversationTable.id, conversationParticipantsTable.conversationId))
		.where(and(eq(conversationParticipantsTable.userId, userId), ne(conversationTable.type, 'INTERNAL')));
	if (rows.length === 0) return 0;
	await tx.delete(conversationTable).where(inArray(conversationTable.id, rows.map((r) => r.id)));
	return rows.length;
}

/**
 * Practice owner → professional, or professional → practice owner, for people
 * who signed up as the wrong one. Refused (409) when the old profile has
 * records of business or, for a practice, other staff accounts.
 *
 * - The old profile and everything that cascades from it is deleted: practices,
 *   locations, documents, signature requests, skills and credentials, plus the
 *   person's practice/professional conversations.
 * - → professional: an empty professional profile is created, so they show in
 *   Professionals straight away; the professional app's onboarding fills it in.
 * - → practice owner: no profile yet. Practice onboarding creates it at its
 *   first step (and would duplicate a pre-made one).
 * - Every session is revoked: each app refuses the other role's sessions anyway,
 *   and the next sign-in lands them in the right app's onboarding.
 */
export async function switchAccountRole(userId: string, to: SwitchableRole, actorId: string) {
	const { from, keys, professionalProfileId } = await db.transaction(async (tx: Tx) => {
		const user = await lockUser(tx, userId);
		if (roleSwitchTarget(user.role) !== to) {
			throw new AccountActionError(400, 'This account can’t be switched to that role.');
		}

		const counts = await countAccountRecords(userId, tx);
		const blockers = roleSwitchBlockers(user.role, counts);
		if (blockers.length) {
			throw new AccountActionError(409, `They have ${joinList(blockers)} on record, so their role can’t be switched.`);
		}

		const keys = user.role === 'CLIENT' ? await practiceFileKeys(userId, tx) : await professionalFileKeys(userId, tx);
		await deleteRoleConversations(tx, userId);
		if (user.role === 'CLIENT') {
			await tx.delete(clientProfileTable).where(eq(clientProfileTable.userId, userId));
		} else {
			await tx.delete(candidateProfileTable).where(eq(candidateProfileTable.userId, userId));
		}

		const now = new Date();
		let professionalProfileId: string | null = null;
		if (to === 'CANDIDATE') {
			professionalProfileId = crypto.randomUUID();
			await tx.insert(candidateProfileTable).values({ id: professionalProfileId, userId, createdAt: now, updatedAt: now });
		}

		await tx
			.update(userTable)
			.set({ role: to, onboardingStep: 1, completedOnboarding: false, updatedAt: now })
			.where(eq(userTable.id, userId));
		await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));

		await recordAction({
			entityType: 'USERS',
			entityId: userId,
			action: 'UPDATE',
			actor: actorId,
			before: { role: user.role },
			after: { role: to },
			metadata: { change: 'ACCOUNT_ROLE', removed: switchRemovals(user.role, counts), professionalProfileId },
			tx
		});
		return { from: user.role, keys, professionalProfileId };
	});

	const filesDeleted = await deleteStoredObjects(keys);
	return { from, to, professionalProfileId, filesDeleted };
}

/**
 * For accounts with history: strip the personal data, keep the records of
 * business (shifts, timesheets, invoices, practices, signed agreements) so the
 * books still add up. The login is removed and the account suspended.
 *
 * Kept on purpose: practice companies and locations (business, not personal),
 * signature requests (signed contracts), professional AGREEMENT documents, and
 * the action_history ledger, whose actor snapshots are the audit trail.
 */
export async function anonymizeAccount(userId: string, actorId: string) {
	const keys = await db.transaction(async (tx: Tx) => {
		const user = await lockUser(tx, userId);
		if (isAnonymized(user.email)) throw new AccountActionError(400, 'This account is already anonymized.');

		const keys = [
			...(await professionalFileKeys(userId, tx, { keepTypes: KEPT_DOCUMENT_TYPES })),
			...(await avatarKey(userId, tx))
		];
		const now = new Date();

		const candidateIds = await professionalProfileIds(userId, tx);
		if (candidateIds.length) {
			await tx
				.delete(candidateDocumentUploadsTable)
				.where(
					and(
						inArray(candidateDocumentUploadsTable.candidateId, candidateIds),
						ne(candidateDocumentUploadsTable.type, 'AGREEMENT')
					)
				);
			await tx
				.update(candidateProfileTable)
				.set({
					address: null,
					city: null,
					zipcode: null,
					completeAddress: null,
					lat: null,
					lon: null,
					geom: null,
					cellPhone: null,
					citizenship: null,
					birthday: null,
					ssnLast4: null,
					featureMe: false,
					status: 'INACTIVE',
					updatedAt: now
				})
				.where(inArray(candidateProfileTable.id, candidateIds));
		}

		await tx
			.update(clientProfileTable)
			.set({ cellPhone: null, birthday: null, status: 'INACTIVE', updatedAt: now })
			.where(eq(clientProfileTable.userId, userId));
		// A staff member's link to the practice goes; an owner's own row stays with the practice.
		if (user.role === 'CLIENT_STAFF') {
			await tx.delete(clientStaffProfileTable).where(eq(clientStaffProfileTable.userId, userId));
		}
		await tx
			.update(affiliateProfileTable)
			.set({ displayName: null, contactEmail: null, contactPhone: null, website: null, updatedAt: now })
			.where(eq(affiliateProfileTable.userId, userId));
		// Threads stay readable for the other side; only the words go.
		await tx.update(messageTable).set({ body: '[Message removed]' }).where(eq(messageTable.senderId, userId));

		await tx
			.update(userTable)
			.set({
				firstName: 'Deleted',
				lastName: 'user',
				name: 'Deleted user',
				email: anonymizedEmail(userId),
				avatarUrl: null,
				password: null,
				token: null,
				receiveEmail: false,
				receiveSms: false,
				banned: true,
				banReason: 'Account deleted',
				banExpires: null,
				twoFactorEnabled: false,
				updatedAt: now
			})
			.where(eq(userTable.id, userId));
		await tx.delete(accountTable).where(eq(accountTable.userId, userId));
		await tx.delete(twoFactorTable).where(eq(twoFactorTable.userId, userId));
		await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));

		// No before-values: copying the personal data into the ledger would undo this.
		await recordAction({
			entityType: 'USERS',
			entityId: userId,
			action: 'DELETE',
			actor: actorId,
			metadata: { change: 'ANONYMIZED', role: user.role, filesRemoved: keys.length },
			tx
		});
		return keys;
	});

	return { filesDeleted: await deleteStoredObjects(keys) };
}

/**
 * Hard delete for accounts with no records of business (UserHasRecordsError
 * otherwise; anonymize those). Also removes the files their profiles owned.
 */
export async function deleteAccount(userId: string, actorId: string) {
	const keys = [
		...(await practiceFileKeys(userId)),
		...(await professionalFileKeys(userId)),
		...(await avatarKey(userId))
	];
	const [target] = await db.select({ role: userTable.role }).from(userTable).where(eq(userTable.id, userId));
	if (!target) throw new AccountActionError(404, 'User not found.');

	await deleteUsersWithoutRecords({ ids: [userId] });
	await recordAction({
		entityType: 'USERS',
		entityId: userId,
		action: 'DELETE',
		actor: actorId,
		metadata: { change: 'ACCOUNT_DELETED', role: target.role, filesRemoved: keys.length }
	});
	return { filesDeleted: await deleteStoredObjects(keys) };
}

/** Sign the user out of every app and device. */
export async function revokeAllSessions(userId: string, actorId: string) {
	const removed = await db.delete(sessionTable).where(eq(sessionTable.userId, userId)).returning({ id: sessionTable.id });
	await recordAction({
		entityType: 'USERS',
		entityId: userId,
		action: 'SIGN_OUT',
		actor: actorId,
		metadata: { change: 'ALL_SESSIONS_REVOKED', sessions: removed.length }
	});
	return removed.length;
}
