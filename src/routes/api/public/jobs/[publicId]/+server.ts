import type { RequestHandler } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';
import { getPublicJob, isPublicId, resolvePublicJob } from '$lib/server/publicJobs/queries';
import {
	corsPreflight,
	guardPublicRequest,
	publicError,
	publicJson
} from '$lib/server/publicJobs/http';

/**
 * Public job detail. 404 for a malformed or unknown id; 410 `{ closed: true }`
 * when the posting exists but is no longer publishable (filled, closed, client
 * inactive…) so the marketing page can show "this position has been filled".
 */
export const GET: RequestHandler = async (event) => {
	const blocked = guardPublicRequest(event);
	if (blocked) return blocked;

	const { publicId } = event.params;
	if (!isPublicId(publicId)) return publicError(event.request, 404, { message: 'Not found' });

	try {
		const job = await getPublicJob(publicId);
		if (job) return publicJson({ job }, { request: event.request });

		const resolved = await resolvePublicJob(publicId);
		if (!resolved) return publicError(event.request, 404, { message: 'Not found' });
		return publicError(event.request, 410, { closed: true });
	} catch (err) {
		logger.error('public job detail failed', { error: err, path: event.url.pathname });
		return publicError(event.request, 500, { message: 'Internal server error' });
	}
};

export const OPTIONS: RequestHandler = async ({ request }) => corsPreflight(request);
