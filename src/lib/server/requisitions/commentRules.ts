import { USER_ROLES } from '$lib/config/constants';

/**
 * Pure rules for the requisition comment thread, kept apart from the DB code so
 * the visibility/notification decisions are unit-tested.
 */

/** Only SUPERADMIN may write an internal (client-hidden) note; anyone else's flag is ignored. */
export function resolveCommentInternal(role: string | null | undefined, raw: unknown): boolean {
	return role === USER_ROLES.SUPERADMIN && raw === 'true';
}

/**
 * Who gets emailed about a new comment.
 *   - internal note  → nobody
 *   - admin author   → client owner + client-side users already on the thread
 *   - client author  → admins (already filtered to receiveEmail=true by the caller)
 * The author never gets their own comment; addresses are de-duplicated case-insensitively.
 */
export function pickCommentRecipients(input: {
	internal: boolean;
	authorId: string;
	authorIsAdmin: boolean;
	owner: { userId: string; email: string | null } | null;
	clientCommenters: { userId: string; email: string | null }[];
	adminEmails: (string | null)[];
}): string[] {
	if (input.internal) return [];
	const raw = input.authorIsAdmin
		? [
				input.owner && input.owner.userId !== input.authorId ? input.owner.email : null,
				...input.clientCommenters.filter((c) => c.userId !== input.authorId).map((c) => c.email)
			]
		: input.adminEmails;
	return [...new Set(raw.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
}
