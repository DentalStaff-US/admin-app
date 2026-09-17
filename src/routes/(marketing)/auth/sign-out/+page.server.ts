import { redirect } from 'sveltekit-flash-message/server';
import { auth } from '$lib/server/auth';
import type { PageServerLoad } from './$types';
import { getPostHogClient } from '$lib/server/posthog';
import { recordAction } from '$lib/server/audit/audit';

export const load: PageServerLoad = async () => {
	// ...
};
export const actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(302, '/auth/sign-in');

		const userId = event.locals.user?.id;
		// Ledger row before the session is gone (locals.user is still populated).
		try {
			await recordAction({
				entityType: 'USERS',
				entityId: userId,
				action: 'SIGN_OUT',
				metadata: { sessionId: event.locals.session?.id ?? null }
			});
		} catch (err) {
			console.error('[auth] failed to record sign-out', err);
		}
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
