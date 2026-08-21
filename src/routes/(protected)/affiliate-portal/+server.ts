import { redirect, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { PARTNER_PORTAL_URL } from '$lib/config/portal';
import { logger } from '$lib/server/logger';

/**
 * Hand the signed-in user off to the affiliate portal, already authenticated.
 *
 * Mints a single-use, short-lived token via Better Auth's oneTimeToken plugin
 * (enabled in auth.ts and, until now, unused) and redirects to the portal's
 * /auth/sso, which exchanges it for a `dtss-partner` session.
 *
 * If minting fails we still send the user to the portal — they just sign in
 * normally there. A broken handoff must never be a dead end.
 */
export const GET: RequestHandler = async (event) => {
	const base = PARTNER_PORTAL_URL.replace(/\/$/, '');

	// Relative paths only: this value is echoed into the portal's redirect.
	const requested = event.url.searchParams.get('to');
	const to = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/';

	// NB: token minting is wrapped, the redirect is NOT. `redirect()` works by
	// throwing, so calling it inside the try would have it caught by our own
	// catch block and swallowed.
	let token: string | null = null;
	try {
		const result = await auth.api.generateOneTimeToken({ headers: event.request.headers });
		token = result?.token ?? null;
	} catch (err) {
		logger.error('affiliate portal SSO handoff failed', { error: err });
	}

	if (!token) redirect(302, base);

	redirect(
		302,
		`${base}/auth/sso?token=${encodeURIComponent(token)}&redirectTo=${encodeURIComponent(to)}`
	);
};
