/* eslint-disable no-fallthrough */
import { lucia } from '$lib/server/lucia';
import { redirect, type Handle } from '@sveltejs/kit';
import type { HandleServerError } from '@sveltejs/kit';

import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { USER_ROLES } from '$lib/config/constants';
import { CANDIDATE_APP_DOMAIN } from '$env/static/private';
import { logger } from '$lib/server/logger';
import { isBotScanPath } from '$lib/server/noise';

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

	const sessionId = event.cookies.get(lucia.sessionCookieName);
	if (!sessionId) {
		event.locals.user = null;
		event.locals.session = null;
		return resolve(event);
	}

	const { session, user } = await lucia.validateSession(sessionId);

	// Check if the user is a CANDIDATE before setting cookies or locals
	if (user && user.role === USER_ROLES.CANDIDATE) {
		// Invalidate the session for CANDIDATE users
		await lucia.invalidateSession(session.id);

		// Clear the session cookie
		const sessionCookie = lucia.createBlankSessionCookie();
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		// Redirect to the external candidate app
		redirect(302, CANDIDATE_APP_DOMAIN);
	}

	if (session && session.fresh) {
		const sessionCookie = lucia.createSessionCookie(session.id);
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}
	if (!session) {
		const sessionCookie = lucia.createBlankSessionCookie();
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
	}

	event.locals.user = user;
	event.locals.session = session;

	if (event.route.id?.startsWith('/(protected)')) {
		if (!user) redirect(302, '/auth/sign-in');
		if (!user.verified) redirect(302, '/auth/verify/email');
	}
	if (event.route.id?.startsWith('/(protected)/admin')) {
		if (!checkIsAdmin(user?.role)) redirect(302, '/');
	}

	const response = await resolve(event);
	return response;
};

// Scheduled cron jobs are now run by the dedicated cron service (src/cron/index.ts),
// deployed as a separate Railway service with replicas: 1.
