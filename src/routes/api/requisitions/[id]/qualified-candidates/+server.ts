import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQualifiedProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
import { resolveRequisitionAccess } from '$lib/server/requisitions/access';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const includeAllExperience = url.searchParams.get('includeAllExperience') === 'true';
	const includeOutsidePayRange = url.searchParams.get('includeOutsidePayRange') === 'true';

	const { requisition, location } = await resolveRequisitionAccess(locals.user, Number(params.id));

	const candidates = await getQualifiedProfessionalsForRequisition(requisition, location, {
		includeAllExperience,
		includeOutsidePayRange
	});

	return json(candidates);
};
