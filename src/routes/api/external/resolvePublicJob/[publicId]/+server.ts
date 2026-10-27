import { error, json, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import { logger } from '$lib/server/logger';
import { isPublicId, resolvePublicJob } from '$lib/server/publicJobs/queries';

/**
 * Candidate app: resolve a marketing-site public id to the internal requisition.
 *
 *   GET /api/external/resolvePublicJob/{publicId}
 *   200 { requisitionId: number, permanent: boolean, firstOpenDate: string | null, open: boolean }
 *   404 unknown or malformed id
 *
 * `open: false` means the posting exists but is no longer publishable.
 */
export const GET: RequestHandler = async ({ request, params }) => {
	const user = await authenticateUser(request);

	const { publicId } = params;
	if (!isPublicId(publicId)) throw error(404, 'Not found');

	let resolved;
	try {
		resolved = await resolvePublicJob(publicId);
	} catch (err) {
		logger.error('resolvePublicJob failed', { error: err, distinctId: user?.id });
		throw error(500, 'Internal server error');
	}

	if (!resolved) throw error(404, 'Not found');
	return json(resolved);
};
