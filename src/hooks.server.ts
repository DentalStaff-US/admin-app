/* eslint-disable no-fallthrough */
import { lucia } from '$lib/server/lucia';
import { redirect, type Handle } from '@sveltejs/kit';
import type { HandleServerError } from '@sveltejs/kit';
import {
	processPastRecurrenceDaysJob,
	processOutdatedRequisitionsJob,
	processInvoiceRemindersJob,
	processWorkday48HrReminderJob
} from '$lib/server/jobs';

import log from '$lib/server/log';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { USER_ROLES } from '$lib/config/constants';
import { CANDIDATE_APP_DOMAIN } from '$env/static/private';
import { processTimesheetCreationJob } from '$lib/server/jobs/timesheets';

export const handleError: HandleServerError = async ({ error, event }) => {
	const errorId = crypto.randomUUID();

	event.locals.error = error?.toString() || '';
	if (error instanceof Error) {
		event.locals.errorStackTrace = error.stack || '';
	} else {
		event.locals.errorStackTrace = '';
	}
	event.locals.errorId = errorId;
	log(500, event);

	return {
		message: 'An unexpected error occurred.',
		errorId
	};
};
export const handle: Handle = async ({ event, resolve }) => {
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
	log(response.status, event);
	return response;
};

// Sheduled CRON Jobs
processPastRecurrenceDaysJob();
processInvoiceRemindersJob();
processWorkday48HrReminderJob();
processTimesheetCreationJob();
// processOutdatedRequisitionsJob();
