import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import { getPaginatedUsers, deleteAdminUser } from '$lib/server/database/queries/admin';

const DEFAULT_LIMIT = 25;

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const search = event.url.searchParams.get('search') ?? '';
	const page = Math.max(1, Number(event.url.searchParams.get('page')) || 1);
	const offset = (page - 1) * DEFAULT_LIMIT;

	const { users, count } = await getPaginatedUsers({
		limit: DEFAULT_LIMIT,
		offset,
		search
	});

	return {
		users,
		total: count,
		page,
		limit: DEFAULT_LIMIT,
		search
	};
};

export const actions = {
	deleteUser: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401);
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const id = (formData.get('id') as string | null)?.trim();
		if (!id) return fail(400, { error: 'Missing user id' });

		// Defense-in-depth: never let an admin delete their own account from this UI.
		if (id === user.id) {
			setFlash({ type: 'error', message: 'You cannot delete your own account' }, event);
			return fail(400, { error: 'Cannot delete self' });
		}

		try {
			await deleteAdminUser(id);
			setFlash({ type: 'success', message: 'User deleted' }, event);
			return { success: true };
		} catch (err) {
			console.error('deleteUser failed', err);
			setFlash(
				{
					type: 'error',
					message:
						err instanceof Error
							? `Failed to delete user: ${err.message}`
							: 'Failed to delete user'
				},
				event
			);
			return fail(500, { error: 'Failed to delete user' });
		}
	}
};
