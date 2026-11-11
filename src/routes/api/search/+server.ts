import { error, json, type RequestHandler } from '@sveltejs/kit';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { commandSearch } from '$lib/server/search/commandSearch';

/** ⌘K search. DTSS admins only: it spans every practice and professional. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (!checkIsAdmin(locals.user.role)) throw error(403, 'Forbidden');
	const q = (url.searchParams.get('q') ?? '').slice(0, 100);
	return json({ hits: await commandSearch(q) });
};
