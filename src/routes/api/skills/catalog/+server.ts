import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSkillCatalog } from '$lib/server/database/queries/skills';

/**
 * The skill catalog for SkillRequirementsPicker, scoped to `?disciplineId=`.
 * `?keep=<id>,<id>` keeps archived skills already on a requisition visible so an
 * edit can show (and drop) them.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		error(401, 'Unauthorized role, no access allowed.');
	}

	const disciplineId = url.searchParams.get('disciplineId');
	const keep = (url.searchParams.get('keep') ?? '').split(',').filter(Boolean);

	const catalog = await getSkillCatalog({
		disciplineIds: disciplineId ? [disciplineId] : undefined,
		keepSkillIds: keep
	});

	return json(catalog);
};
