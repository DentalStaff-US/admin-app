import { json, type RequestHandler } from '@sveltejs/kit';
import { startImpersonation } from '$lib/server/impersonation';

/**
 * Begin impersonating a user. The sibling of ./stop.
 *
 * An endpoint rather than a per-page form action so the Impersonate button can
 * live anywhere — the admin users table, the professional header, the client
 * header — without each host re-implementing a privilege-escalation path. The
 * authorization check and the same-app/cross-app decision both live in
 * $lib/server/impersonation.
 *
 * Returns JSON rather than redirecting, because the two outcomes need different
 * browser behaviour and only the client can do either:
 *   - `same-app`: the session cookie has been swapped, so the caller must do a
 *     FULL page load (not a client-side navigation) for the new session to be
 *     read server-side.
 *   - `handoff`: open `handoffUrl` on the candidate domain in a new tab; this
 *     domain's session was deliberately left alone.
 */
export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => null);
	const userId = typeof body?.userId === 'string' ? body.userId : null;
	const redirectTo = typeof body?.redirectTo === 'string' ? body.redirectTo : undefined;

	const result = await startImpersonation(event, userId, { redirectTo });

	if (!result.ok) {
		return json({ success: false, message: result.message }, { status: result.status });
	}

	return json({ success: true, ...result });
};
