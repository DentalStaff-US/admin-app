import posthog from 'posthog-js';
import { PUBLIC_POSTHOG_PROJECT_TOKEN } from '$env/static/public';
import type { HandleClientError } from '@sveltejs/kit';
import { dev } from '$app/environment';

export async function init() {
	posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
		api_host: '/ingest',
		ui_host: 'https://us.posthog.com',
		defaults: '2026-01-30',
		capture_exceptions: true
	});
}

export const handleError: HandleClientError = ({ error }) => {
	const errorId = crypto.randomUUID();
	if (dev) {
		console.error(error);
	} else {
		posthog.captureException(error);
	}
	return {
		message: 'An unexpected error occurred.',
		errorId
	};
};
