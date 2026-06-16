/* eslint-disable no-fallthrough */
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import type { HandleServerError } from '@sveltejs/kit';

import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { USER_ROLES } from '$lib/config/constants';
import { CANDIDATE_APP_DOMAIN } from '$env/static/private';
import { logger } from '$lib/server/logger';
import { isBotScanPath } from '$lib/server/noise';
import type { AppUser } from '$lib/server/auth';

export const handleError: HandleServerError = async ({ error, event, status }) => {
	const errorId = crypto.randomUUID();
	const path = event.url.pathname;

	// Suppress expected noise: bot scans probing for vulnerable endpoints, and any
	// 4xx the framework escalated here (status < 500 means it's not a server fault).
	if (status < 500 || isBotScanPath(path)) {
		return { message: 'An unexpected error occurred.', errorId };
	}

	logger.error('uncaught server error', {
		error,
		errorId,
		path,
		method: event.request.method,
		status,
		distinctId: event.locals.user?.id
	});
	return {
		message: 'An unexpected error occurred.',
		errorId
	};
};
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Missing static-asset requests fall through to here. This is almost always a
	// browser tab from a PRIOR deploy asking for an immutable Vite hash (e.g.
	// /_app/immutable/assets/2.<hash>.css) that this newer container no longer
	// ships. Return a clean 404 instead of running session/redirect logic on a
	// non-route path, which would otherwise throw and surface as a noisy 500.
	if (pathname.startsWith('/_app/')) {
		return new Response('Not found', { status: 404 });
	}

	// Reverse proxy for PostHog — route /ingest requests to PostHog servers
	if (pathname.startsWith('/ingest')) {
		const useAssetHost =
			pathname.startsWith('/ingest/static/') || pathname.startsWith('/ingest/array/');
		const hostname = useAssetHost ? 'us-assets.i.posthog.com' : 'us.i.posthog.com';

		const url = new URL(event.request.url);
		url.protocol = 'https:';
		url.hostname = hostname;
		url.port = '443';
		url.pathname = pathname.replace(/^\/ingest/, '');

		const headers = new Headers(event.request.headers);
		headers.set('host', hostname);
		headers.set('accept-encoding', '');

		const clientIp = event.request.headers.get('x-forwarded-for') || event.getClientAddress();
		if (clientIp) {
			headers.set('x-forwarded-for', clientIp);
		}

		const response = await fetch(url.toString(), {
			method: event.request.method,
			headers,
			body: event.request.body,
			// @ts-expect-error - duplex is required for streaming request bodies
			duplex: 'half'
		});

		return response;
	}

	if (event.url.pathname === '/api/webhooks/stripe') {
		const requestEvent = event;
		return await resolve(requestEvent, {
			transformPageChunk: ({ html }) => html
		});
	}
	const startTimer = Date.now();
	event.locals.startTimer = startTimer;

	// During build/prerender there's no request session to resolve.
	if (building) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	// Validate the Better Auth session and normalise the user into the
	// Lucia-compatible shape the rest of the app expects (userId/verified/avatarUrl).
	const authSession = await auth.api.getSession({ headers: event.request.headers });
	const baUser = authSession?.user ?? null;
	const user: AppUser | null = baUser
		? {
				...baUser,
				role: baUser.role ?? USER_ROLES.CANDIDATE,
				userId: baUser.id,
				verified: baUser.emailVerified,
				avatarUrl: baUser.image ?? null
			}
		: null;

	event.locals.user = user;
	event.locals.session = authSession?.session ?? null;

	// Let Better Auth own its endpoints (/api/auth/*) — no app gating/redirects.
	if (event.url.pathname.startsWith('/api/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	// The admin app refuses CANDIDATE sessions: sign them out here and bounce
	// them to the candidate app, which is the only place candidates may log in.
	if (user && user.role === USER_ROLES.CANDIDATE) {
		try {
			await auth.api.signOut({ headers: event.request.headers });
		} catch {
			// best-effort: even if revocation fails, still redirect away
		}
		event.locals.user = null;
		event.locals.session = null;
		redirect(302, CANDIDATE_APP_DOMAIN);
	}

	if (event.route.id?.startsWith('/(protected)')) {
		if (!user) redirect(302, '/auth/sign-in');
		if (!user.verified) redirect(302, '/auth/verify/email');
	}
	if (event.route.id?.startsWith('/(protected)/admin')) {
		if (!checkIsAdmin(user?.role)) redirect(302, '/');
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// Scheduled cron jobs are now run by the dedicated cron service (src/cron/index.ts),
// deployed as a separate Railway service with replicas: 1.
