import { error, type RequestHandler } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { findExport } from '$lib/server/export/registry';
import { csvResponse, datedFilename } from '$lib/server/export/csv';
import { logger } from '$lib/server/logger';

/**
 * GET /admin/menu/exports/<key>?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Superadmin only. Dates optional and inclusive.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (locals.user?.role !== USER_ROLES.SUPERADMIN) throw error(403, 'Superadmin only');

	const def = params.kind ? findExport(params.kind) : undefined;
	if (!def) throw error(404, 'Unknown export');

	const parse = (v: string | null, endOfDay: boolean) => {
		if (!v) return undefined;
		const d = new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
		if (Number.isNaN(d.getTime())) throw error(400, `Invalid date: ${v}`);
		return d;
	};
	const range = {
		from: parse(url.searchParams.get('from'), false),
		to: parse(url.searchParams.get('to'), true)
	};

	const csv = await def.run(range);
	logger.info('export downloaded', { kind: def.key, by: locals.user.id, ...range });
	return csvResponse(datedFilename(def.key), csv);
};
