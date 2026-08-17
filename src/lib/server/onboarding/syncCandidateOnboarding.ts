import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { updateUser } from '$lib/server/database/queries/users';
import { isCandidateProfileComplete } from './candidateCompleteness';
import { notifyAdminsOfCandidateReadyForApproval } from '$lib/server/notifications/transactional';

/**
 * Flips `users.completed_onboarding` once a professional's profile satisfies
 * `candidateProfileCompleteSql`, and tells admins they're ready to review.
 *
 * Called from every onboarding write that can be the *last* missing piece —
 * profile setup, disciplines, document upload — rather than from one designated
 * "final" step. Completion is therefore whichever action happens to finish the
 * set, in any order, which is what makes this robust where a step counter was
 * not: a professional who uploads a resume before picking a discipline still
 * completes correctly.
 *
 * Onboarding deliberately completes at the *resume* point, before the optional
 * LICENSE/CERTIFICATE/OTHER uploads — those are chased later by the weekly
 * nudge rather than blocking access to the app.
 *
 * Idempotent and side-effect-safe: returns early once the flag is set, so the
 * admin email fires exactly once per professional. Never throws — onboarding
 * must not fail because this did.
 */
export async function syncCandidateOnboardingCompletion(opts: {
	candidateId: string;
	userId: string;
}): Promise<void> {
	try {
		const [user] = await db
			.select({ completedOnboarding: userTable.completedOnboarding })
			.from(userTable)
			.where(eq(userTable.id, opts.userId))
			.limit(1);

		if (!user || user.completedOnboarding) return;

		const complete = await isCandidateProfileComplete(opts.candidateId);
		if (!complete) return;

		await updateUser(opts.userId, { completedOnboarding: true });
		await notifyAdminsOfCandidateReadyForApproval(opts.candidateId);
	} catch (e) {
		console.error('[syncCandidateOnboardingCompletion] failed', {
			error: e,
			candidateId: opts.candidateId
		});
	}
}
