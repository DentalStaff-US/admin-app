/**
 * Starting impersonation, in one place.
 *
 * Previously this lived inline in the admin users page's `impersonate` action.
 * It is now shared by that action, the `/admin/impersonation/start` endpoint, and
 * therefore the Impersonate buttons on the professional and client profile
 * headers — because three copies of a privilege-escalation path is three chances
 * to get the authorization check wrong.
 *
 * TWO PATHS, because the platform spans two apps:
 *
 *   CLIENT / CLIENT_STAFF live in THIS app → Better Auth's native
 *     `impersonateUser`, which swaps the admin's own session cookie on this
 *     domain. The layout banner plus /admin/impersonation/stop exits it.
 *
 *   CANDIDATE lives in the candidate app → the admin app's session hook actively
 *     bounces CANDIDATE-role sessions to CANDIDATE_APP_DOMAIN, so impersonating
 *     one here would immediately log the admin out of their own session for
 *     nothing. Instead we mint the impersonation session with the same primitive
 *     Better Auth uses internally but deliberately SKIP the cookie, then hand the
 *     session across via a one-time token. The admin's session on this domain is
 *     untouched, and the caller opens the handoff in a new tab.
 *
 * The ledger is written by the `session.create.after` database hook in auth.ts —
 * every route into a session passes through `internalAdapter.createSession`, so
 * both paths above produce an IMPERSONATE_START row without this module writing one.
 */

import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import { USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';

/** Minutes the cross-app handoff token stays valid. Matches the one-time-token plugin. */
const HANDOFF_TTL_MS = 3 * 60 * 1000;

export type StartImpersonationResult =
	/** Same-app: the session cookie has been swapped. Send the browser to `redirectTo`. */
	| { ok: true; mode: 'same-app'; redirectTo: string }
	/** Cross-app: open this on the candidate domain. No cookie was touched here. */
	| { ok: true; mode: 'handoff'; handoffUrl: string }
	| {
			ok: false;
			status: 400 | 401 | 403 | 404 | 500;
			message: string;
	  };

/**
 * Begin impersonating `targetUserId` as `event.locals.user`.
 *
 * The target's role is resolved from the database rather than taken from the
 * caller. The previous inline version trusted a posted `role` field, which meant a
 * forged value could route a CANDIDATE down the same-app path — destroying the
 * admin's own session on this domain for a session the app then bounces. Callers
 * now only supply an id, and this function decides.
 */
export async function startImpersonation(
	event: RequestEvent,
	targetUserId: string | null | undefined,
	opts: { redirectTo?: string } = {}
): Promise<StartImpersonationResult> {
	const admin = event.locals.user;
	if (!admin) return { ok: false, status: 401, message: 'Not authenticated' };

	// Impersonation is the single most privileged action in the app, so the gate is
	// restated here rather than relying on any caller having checked. Better Auth's
	// admin plugin independently enforces `adminRoles: [SUPERADMIN]` on
	// impersonateUser; this check also covers the cross-app branch, which bypasses
	// that endpoint.
	if (admin.role !== USER_ROLES.SUPERADMIN) {
		return { ok: false, status: 403, message: 'Not authorized to impersonate' };
	}

	const id = targetUserId?.trim();
	if (!id) return { ok: false, status: 400, message: 'Missing user id' };
	if (id === admin.id) {
		return { ok: false, status: 400, message: 'You are already signed in as yourself' };
	}

	const [target] = await db
		.select({ id: userTable.id, role: userTable.role, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, id))
		.limit(1);

	if (!target) return { ok: false, status: 404, message: 'User not found' };

	// Never impersonate another superadmin: it would let one admin act as another
	// with only the first admin's name in the ledger.
	if (target.role === USER_ROLES.SUPERADMIN) {
		return { ok: false, status: 403, message: 'Cannot impersonate an administrator' };
	}

	if (target.role === USER_ROLES.CANDIDATE) {
		if (!env.CANDIDATE_APP_DOMAIN) {
			return {
				ok: false,
				status: 500,
				message: 'CANDIDATE_APP_DOMAIN is not configured, so candidates cannot be impersonated.'
			};
		}
		try {
			const ctx = await auth.$context;
			// The same session creation Better Auth's own impersonateUser performs —
			// but WITHOUT setSessionCookie, so the admin's session on this domain
			// survives. That omission is the entire point of this branch.
			const session = await ctx.internalAdapter.createSession(target.id, true, {
				impersonatedBy: admin.id
			});
			if (!session) {
				return { ok: false, status: 500, message: 'Failed to create impersonation session' };
			}

			// A short-lived, single-use token bound to that session, stored exactly as
			// the one-time-token plugin stores its own so the candidate app's
			// /auth/impersonate route can verify it.
			const token = crypto.randomUUID();
			await ctx.internalAdapter.createVerificationValue({
				identifier: `one-time-token:${token}`,
				value: session.token,
				expiresAt: new Date(Date.now() + HANDOFF_TTL_MS)
			});

			return {
				ok: true,
				mode: 'handoff',
				handoffUrl: `${env.CANDIDATE_APP_DOMAIN}/auth/impersonate?token=${token}`
			};
		} catch (err) {
			logger.error('startImpersonation (candidate) failed', {
				error: err,
				distinctId: admin.id
			});
			return { ok: false, status: 500, message: 'Failed to start impersonation' };
		}
	}

	// Same-app: CLIENT / CLIENT_STAFF. Better Auth swaps the session cookie through
	// the sveltekitCookies plugin, which writes to the current request event — so
	// this works identically from a form action and from a +server.ts handler.
	try {
		await auth.api.impersonateUser({
			headers: event.request.headers,
			body: { userId: target.id }
		});
	} catch (err) {
		logger.error('startImpersonation failed', { error: err, distinctId: admin.id });
		return { ok: false, status: 500, message: 'Failed to start impersonation' };
	}

	return { ok: true, mode: 'same-app', redirectTo: opts.redirectTo ?? '/dashboard' };
}
