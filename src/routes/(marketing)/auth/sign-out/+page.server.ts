import { redirect } from 'sveltekit-flash-message/server';
import { auth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';
import { getPostHogClient } from '$lib/server/posthog';

export const load: PageServerLoad = async () => {
	// ...
};
export const actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(302, '/auth/sign-in');

		const userId = event.locals.user?.id;
		// Revokes the session and clears the cookie (via the sveltekitCookies plugin).
		await auth.api.signOut({ headers: event.request.headers });

		if (userId) {
			const posthog = getPostHogClient();
			posthog.capture({
				distinctId: userId,
				event: 'user_signed_out'
			});
		}

		const message = { type: 'success', message: 'Logged out' } as const;
		redirect(302, '/auth/sign-in', message, event.cookies);
	}
};
