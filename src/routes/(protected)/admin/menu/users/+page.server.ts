import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import { getPaginatedUsers, deleteAdminUser } from '$lib/server/database/queries/admin';
import { auth } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

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

	// Impersonate a user. CLIENT / CLIENT_STAFF live in this app → native
	// impersonateUser (admin becomes them here; banner + stopImpersonating exits).
	// CANDIDATE lives in the candidate app → mint an impersonation session with
	// the same primitive Better Auth uses internally, hand it across via a
	// one-time token (no cookie touched on the admin domain), open in a new tab.
	impersonate: async (event: RequestEvent) => {
		const admin = event.locals.user;
		if (!admin) return fail(401);
		if (admin.role !== USER_ROLES.SUPERADMIN) return fail(403);

		const formData = await event.request.formData();
		const id = (formData.get('id') as string | null)?.trim();
		const role = (formData.get('role') as string | null)?.trim();
		if (!id || !role) return fail(400, { error: 'Missing user id or role' });
		if (id === admin.id || role === USER_ROLES.SUPERADMIN) {
			return fail(400, { error: 'Cannot impersonate this account' });
		}

		// Cross-app: candidates can only be impersonated on the candidate domain.
		if (role === USER_ROLES.CANDIDATE) {
			try {
				const ctx = await auth.$context;
				// Same session-creation Better Auth's impersonateUser uses (admin.routes
				// line 585) — but we deliberately skip setSessionCookie so the admin's
				// own session on this domain is untouched.
				const session = await ctx.internalAdapter.createSession(id, true, {
					impersonatedBy: admin.id
				});
				if (!session) return fail(500, { error: 'Failed to create impersonation session' });

				// Store a one-time token bound to that session (3-min TTL), exactly as
				// the one-time-token plugin does, so the candidate app can verify it.
				const token = crypto.randomUUID();
				await ctx.internalAdapter.createVerificationValue({
					identifier: `one-time-token:${token}`,
					value: session.token,
					expiresAt: new Date(Date.now() + 3 * 60 * 1000)
				});

				const handoffUrl = `${env.CANDIDATE_APP_DOMAIN}/auth/impersonate?token=${token}`;
				// Client opens this in a new tab (candidate domain).
				return { handoffUrl };
			} catch (err) {
				console.error('impersonate (candidate) failed', err);
				return fail(500, { error: 'Failed to start impersonation' });
			}
		}

		// Same-app: CLIENT / CLIENT_STAFF.
		try {
			await auth.api.impersonateUser({ headers: event.request.headers, body: { userId: id } });
		} catch (err) {
			console.error('impersonate failed', err);
			setFlash({ type: 'error', message: 'Failed to start impersonation' }, event);
			return fail(500, { error: 'Failed to impersonate' });
		}
		redirect(303, '/dashboard');
	}
};
