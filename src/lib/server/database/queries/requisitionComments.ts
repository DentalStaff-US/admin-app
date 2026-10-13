import { and, asc, eq } from 'drizzle-orm';
import db from '../drizzle';
import { requisitionCommentTable } from '../schemas/requisition';
import { userTable } from '../schemas/auth';
import { USER_ROLES } from '$lib/config/constants';

export const REQUISITION_COMMENT_MAX_LENGTH = 5000;

/**
 * Comment thread for a requisition, oldest first (reads like a conversation).
 * `includeInternal` must only be true for SUPERADMIN — internal rows are
 * admin-only notes and are filtered here, not in the UI.
 */
export async function getRequisitionComments(
	requisitionId: number,
	{ includeInternal }: { includeInternal: boolean }
) {
	return await db
		.select({
			id: requisitionCommentTable.id,
			body: requisitionCommentTable.body,
			internal: requisitionCommentTable.internal,
			createdAt: requisitionCommentTable.createdAt,
			authorId: requisitionCommentTable.authorId,
			authorFirstName: userTable.firstName,
			authorLastName: userTable.lastName,
			authorAvatarUrl: userTable.avatarUrl,
			authorRole: userTable.role
		})
		.from(requisitionCommentTable)
		.innerJoin(userTable, eq(userTable.id, requisitionCommentTable.authorId))
		.where(
			and(
				eq(requisitionCommentTable.requisitionId, requisitionId),
				includeInternal ? undefined : eq(requisitionCommentTable.internal, false)
			)
		)
		.orderBy(asc(requisitionCommentTable.createdAt));
}

export type RequisitionComment = Awaited<ReturnType<typeof getRequisitionComments>>[number];

export async function addRequisitionComment({
	requisitionId,
	authorId,
	body,
	internal
}: {
	requisitionId: number;
	authorId: string;
	body: string;
	internal: boolean;
}) {
	const [result] = await db
		.insert(requisitionCommentTable)
		.values({
			id: crypto.randomUUID(),
			requisitionId,
			authorId,
			body,
			internal,
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning();
	return result;
}

export async function getRequisitionCommentById(commentId: string) {
	const [row] = await db
		.select()
		.from(requisitionCommentTable)
		.where(eq(requisitionCommentTable.id, commentId))
		.limit(1);
	return row ?? null;
}

/**
 * Authors may delete their own comments; SUPERADMIN may delete any. Scoped to
 * the requisition so a comment id from another thread can't be deleted through
 * this one. Returns the deleted row, or null when nothing matched.
 */
export async function deleteRequisitionComment(
	commentId: string,
	requisitionId: number,
	{ userId, isAdmin }: { userId: string; isAdmin: boolean }
) {
	const [deleted] = await db
		.delete(requisitionCommentTable)
		.where(
			and(
				eq(requisitionCommentTable.id, commentId),
				eq(requisitionCommentTable.requisitionId, requisitionId),
				isAdmin ? undefined : eq(requisitionCommentTable.authorId, userId)
			)
		)
		.returning();
	return deleted ?? null;
}

/** Client-side (non-admin) users who have commented on this thread, for notification fan-out. */
export async function getClientCommenterEmails(requisitionId: number) {
	const rows = await db
		.selectDistinct({ userId: userTable.id, email: userTable.email, role: userTable.role })
		.from(requisitionCommentTable)
		.innerJoin(userTable, eq(userTable.id, requisitionCommentTable.authorId))
		.where(eq(requisitionCommentTable.requisitionId, requisitionId));
	return rows.filter((r) => r.role !== USER_ROLES.SUPERADMIN && !!r.email);
}
