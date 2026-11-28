import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { can } from '$lib/authz';
import { getConversationLog } from '$lib/server/inbox/conversationLog';
import { readConversationLogFilters } from '$features/inbox/conversationLog';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (!can(user, 'inbox.monitor')) redirect(302, '/dashboard');

	const filters = readConversationLogFilters(event.url.searchParams);
	const page = Math.max(1, Math.floor(Number(event.url.searchParams.get('page'))) || 1);
	const { rows, total } = await getConversationLog(filters, { page, pageSize: PAGE_SIZE });

	return { rows, total, page, pageSize: PAGE_SIZE, filters };
};
