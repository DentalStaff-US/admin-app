import posthog from 'posthog-js';
import { PUBLIC_POSTHOG_PROJECT_TOKEN } from '$env/static/public';
import type { HandleClientError } from '@sveltejs/kit';
import { logger } from '$lib/logger';

export async function init() {
	posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
		api_host: '/ingest',
		ui_host: 'https://us.posthog.com',
		defaults: '2026-01-30',
		capture_exceptions: true
	});
	posthog.register({ source: 'admin' });
}

export const handleError: HandleClientError = ({ error, event }) => {
	const errorId = crypto.randomUUID();
	logger.error('uncaught client error', {
		error,
		errorId,
		path: event?.url?.pathname,
		route: event?.route?.id
	});
	return {
		message: 'An unexpected error occurred.',
		errorId
	};
};
