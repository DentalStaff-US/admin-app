import { redirect } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { getOnboardingSummary } from '$lib/features/onboarding/server/completion.server';
import type { PageServerLoad } from './$types';

// The end of client onboarding (06 › Client onboarding): the practice floating
// stack and "Post your first request". Read-only.
export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');

	// Same audience as the billing step: the CLIENT account owner.
	if (user.role !== USER_ROLES.CLIENT) redirect(302, '/dashboard');

	const summary = await getOnboardingSummary(user.id);
	if (!summary) redirect(302, '/onboarding/client/company');

	return { user, summary };
};
