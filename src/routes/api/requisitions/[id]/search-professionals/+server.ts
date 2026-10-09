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
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const search = (url.searchParams.get('q') ?? '').trim();
	const limitParam = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 25;

	// Dates the caller intends to staff, so each result can carry an availability
	// warning. Annotative only — see searchProfessionalsForRequisition. Malformed
	// values are dropped rather than 400'd: a missing badge degrades gracefully,
	// whereas failing the whole search would block the assign override.
	const dates = [...new Set(url.searchParams.getAll('date').filter((d) => ISO_DATE.test(d)))].slice(
		0,
		62
	);

	const { requisition, location } = await resolveRequisitionAccess(locals.user, Number(params.id));

	const results = await searchProfessionalsForRequisition(requisition, location, {
		search,
		limit,
		dates
	});

	return json(results);
};
