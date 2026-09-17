import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import { getActionHistoryPage } from '$lib/server/audit/queries';
import { logger } from '$lib/server/logger';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const q = event.url.searchParams;
	const page = Math.max(1, Number(q.get('page')) || 1);
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		Math.max(1, Number(q.get('pageSize')) || DEFAULT_PAGE_SIZE)
	);

	const filters = {
		search: q.get('search') || '',
		startDate: q.get('startDate') || '',
		endDate: q.get('endDate') || '',
		entityType: q.get('entityType') || '',
		action: q.get('action') || '',
		role: q.get('role') || '',
		source: q.get('source') || ''
	};

	try {
		const result = await getActionHistoryPage(filters, { page, pageSize });
		return { ...result, filters };
	} catch (e) {
		logger.error('record-history: failed to load ledger page', { error: e });
		return { rows: [], total: 0, page, pageSize, filters };
	}
};
