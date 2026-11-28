import { error, json } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import { adminKpis, shiftPipeline } from '$lib/features/dashboard/server/adminMetrics';
import { adminScope } from '$lib/features/dashboard/server/scope';
import { parseKpiWindow } from '$lib/features/dashboard/window';
import type { RequestHandler } from './$types';
import { can } from '$lib/authz';

/**
 * The KPI band and pipeline for one window (10 §3.4): changing the window fetches
 * this instead of re-running every dashboard query.
 */
export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	if (!locals.user || !can(locals.user, 'dashboard.read')) error(403, 'Not allowed');
	setHeaders({ 'cache-control': 'private, no-store' });
	const scope = adminScope(locals.user.role);
	const window = parseKpiWindow(url.searchParams.get('window'));
	const now = new Date();
	const [kpis, pipeline] = await Promise.all([adminKpis(scope, window, now), shiftPipeline(scope, window, now)]);
	return json({ kpis, pipeline });
};
