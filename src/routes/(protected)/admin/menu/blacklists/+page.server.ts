import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import {
	getAllBlacklistEntries,
	removeCandidateFromBlacklist
} from '$lib/server/database/queries/blacklist';
import { logger } from '$lib/server/logger';

const DEFAULT_LIMIT = 25;

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const search = event.url.searchParams.get('search') ?? '';
	const page = Math.max(1, Number(event.url.searchParams.get('page')) || 1);
	const offset = (page - 1) * DEFAULT_LIMIT;

	const { entries, total } = await getAllBlacklistEntries({
		limit: DEFAULT_LIMIT,
		offset,
		search
	});

	return {
		entries,
		total,
		page,
		limit: DEFAULT_LIMIT,
		search
	};
};

export const actions = {
	removeBlacklist: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401);
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const candidateId = String(formData.get('candidateId') ?? '').trim();
		const companyId = String(formData.get('companyId') ?? '').trim();
		if (!candidateId || !companyId) {
			return fail(400, { error: 'Missing candidate or company id' });
		}

		try {
			await removeCandidateFromBlacklist(candidateId, companyId);
			setFlash({ type: 'success', message: 'Removed from blacklist' }, event);
			return { success: true };
		} catch (err) {
			logger.error('admin removeBlacklist failed', { error: err, candidateId, companyId });
			setFlash({ type: 'error', message: 'Failed to remove from blacklist' }, event);
			return fail(500, { error: 'Failed to remove from blacklist' });
		}
	}
};
