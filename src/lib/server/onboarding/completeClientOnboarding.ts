import { getUserById, updateUser } from '$lib/server/database/queries/users';
import { getClientProfilebyUserId } from '$lib/server/database/queries/clients';
import { notifyAdminsOfNewClient } from '$lib/server/notifications/transactional';

/**
 * Marks a client's onboarding complete and alerts admins that a new business is
 * ready for review.
 *
 * The client funnel has two exits — invite staff, or skip inviting — and both
 * previously set `completedOnboarding` inline. Centralising here means the admin
 * notification can't be wired to one path and forgotten on the other.
 *
 * The notification used to fire from the *company* step instead, which is the
 * first screen of the funnel: admins were told about a business before it had a
 * location or staff, and were told nothing when one actually finished. It now
 * fires here, at the real completion point.
 *
 * Idempotent with respect to the email: re-running for an already-onboarded user
 * re-asserts the flag but does not send a second alert.
 */
export async function completeClientOnboarding(userId: string): Promise<void> {
	// getUserById returns { user }, not the row itself.
	const before = await getUserById(userId);
	const alreadyOnboarded = Boolean(before?.user?.completedOnboarding);

	await updateUser(userId, { completedOnboarding: true });

	if (alreadyOnboarded) return;

	const clientProfile = await getClientProfilebyUserId(userId);
	if (!clientProfile) {
		console.warn('[completeClientOnboarding] no client profile for user', userId);
		return;
	}

	// Fire-and-forget: the dispatcher swallows its own errors, and onboarding
	// must not fail because an email did.
	await notifyAdminsOfNewClient(clientProfile.id);
}
