import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
import { resolveRequisitionAccess } from '$lib/server/requisitions/access';

/**
 * Name search across professionals for the admin assign override.
 *
 * Shares `resolveRequisitionAccess` with the qualified-candidates endpoint so
 * the tenant-isolation rule lives in exactly one place.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const search = (url.searchParams.get('q') ?? '').trim();
	const limitParam = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 25;

	const { requisition, location } = await resolveRequisitionAccess(locals.user, Number(params.id));

	const results = await searchProfessionalsForRequisition(requisition, location, {
		search,
		limit
	});

	return json(results);
};
