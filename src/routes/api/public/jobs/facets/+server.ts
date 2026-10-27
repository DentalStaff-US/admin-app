import type { RequestHandler } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { getPublicJobFacets } from '$lib/server/publicJobs/queries';
import {
	corsPreflight,
	guardPublicRequest,
	publicError,
	publicJson
} from '$lib/server/publicJobs/http';

/** Filter options (with counts) for the public job board. */
export const GET: RequestHandler = async (event) => {
	const blocked = guardPublicRequest(event);
	if (blocked) return blocked;

	try {
		return publicJson(await getPublicJobFacets(), { request: event.request });
	} catch (err) {
		logger.error('public job facets failed', { error: err, path: event.url.pathname });
		return publicError(event.request, 500, { message: 'Internal server error' });
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => corsPreflight(request);
