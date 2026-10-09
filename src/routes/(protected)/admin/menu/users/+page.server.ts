import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import { getPaginatedUsers, deleteAdminUser } from '$lib/server/database/queries/admin';
import { auth } from '$lib/server/auth';
import { startImpersonation } from '$lib/server/impersonation';

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
						err instanceof Error ? `Failed to delete user: ${err.message}` : 'Failed to delete user'
				},
				event
			);
			return fail(500, { error: 'Failed to delete user' });
		}
	},

	// Suspend a user. Reason + optional duration (days); blank duration = permanent.
	banUser: async (event: RequestEvent) => {
		const admin = event.locals.user;
		if (!admin) return fail(401);
		if (admin.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const id = (formData.get('id') as string | null)?.trim();
		const reason = (formData.get('reason') as string | null)?.trim() || undefined;
		const days = Number(formData.get('days'));
		if (!id) return fail(400, { error: 'Missing user id' });
		if (id === admin.id) {
			setFlash({ type: 'error', message: 'You cannot ban your own account' }, event);
			return fail(400, { error: 'Cannot ban self' });
		}

		try {
			await auth.api.banUser({
				headers: event.request.headers,
				body: {
					userId: id,
					banReason: reason,
					// banExpiresIn is seconds; omit for a permanent ban.
					...(days && days > 0 ? { banExpiresIn: days * 24 * 60 * 60 } : {})
				}
			});
			setFlash({ type: 'success', message: 'User suspended' }, event);
			return { success: true };
		} catch (err) {
			console.error('banUser failed', err);
			setFlash({ type: 'error', message: 'Failed to suspend user' }, event);
			return fail(500, { error: 'Failed to ban user' });
		}
	},

	unbanUser: async (event: RequestEvent) => {
		const admin = event.locals.user;
		if (!admin) return fail(401);
		if (admin.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const id = (formData.get('id') as string | null)?.trim();
		if (!id) return fail(400, { error: 'Missing user id' });

		try {
			await auth.api.unbanUser({ headers: event.request.headers, body: { userId: id } });
			setFlash({ type: 'success', message: 'User reinstated' }, event);
			return { success: true };
		} catch (err) {
			console.error('unbanUser failed', err);
			setFlash({ type: 'error', message: 'Failed to reinstate user' }, event);
			return fail(500, { error: 'Failed to unban user' });
		}
	},

	// Impersonate a user. The two-path logic (same-app cookie swap vs cross-app
	// handoff for candidates) and the SUPERADMIN gate live in
	// $lib/server/impersonation, shared with /admin/impersonation/start and the
	// Impersonate buttons on the professional and client profile headers.
	//
	// The posted `role` is no longer read: the shared helper resolves the target's
	// role from the database, so a forged value cannot route a candidate down the
	// same-app path.
	impersonate: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		const id = (formData.get('id') as string | null)?.trim();

		const result = await startImpersonation(event, id);

		if (!result.ok) {
			if (result.status === 500) {
				setFlash({ type: 'error', message: result.message }, event);
			}
			return fail(result.status, { error: result.message });
		}

		// Candidate: hand the URL back so the client can open the candidate domain
		// in a new tab. This domain's session is untouched.
		if (result.mode === 'handoff') return { handoffUrl: result.handoffUrl };

		redirect(303, result.redirectTo);
	}
};
