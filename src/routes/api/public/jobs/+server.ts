import type { RequestHandler } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { listPublicJobs, parseFilters } from '$lib/server/publicJobs/queries';
import {
	corsPreflight,
	guardPublicRequest,
	publicError,
	publicJson
} from '$lib/server/publicJobs/http';

/** Public, anonymous job list for the marketing site. See $lib/server/publicJobs. */
export const GET: RequestHandler = async (event) => {
	const blocked = guardPublicRequest(event);
	if (blocked) return blocked;

	const parsed = parseFilters(event.url.searchParams);
	if (!parsed.success) {
		return publicError(event.request, 400, {
			message: 'Invalid filters',
			issues: parsed.error.flatten().fieldErrors
		});
	}

	try {
		return publicJson(await listPublicJobs(parsed.data), { request: event.request });
	} catch (err) {
		logger.error('public job list failed', { error: err, path: event.url.pathname });
		return publicError(event.request, 500, { message: 'Internal server error' });
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => corsPreflight(request);
