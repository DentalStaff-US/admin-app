import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { can, guardAccountAction } from '$lib/authz';
import { auth } from '$lib/server/auth';
import { hasTypedConfirmation } from '$lib/server/confirmation';
import { getActivityForEntity } from '$lib/server/audit/queries';
import { countActiveSuperadmins, UserHasRecordsError } from '$lib/server/database/queries/admin';
import {
	AccountActionError,
	anonymizeAccount,
	deleteAccount,
	getAccountOverview,
	revokeAllSessions,
	switchAccountRole
} from '$lib/server/accounts';
import { roleSwitchTarget } from '$features/admin/components/people/accountControls';
import { roleLabel } from '$features/admin/components/people/people';

type Permission = 'users.ban' | 'users.delete' | 'users.changeRole' | 'sessions.revoke';

/**
 * Permission + AZ-4 guard for an action on this page's user. Returns the
 * signed-in admin and the target, or the failure to hand straight back.
 */
async function authorize(event: RequestEvent, permission: Permission) {
	const actor = event.locals.user;
	if (!actor) return { refused: fail(401, { message: 'Sign in again.' }) };
	const overview = await getAccountOverview(event.params.id);
	if (!overview) return { refused: fail(404, { message: 'User not found.' }) };
	const result = guardAccountAction(actor, overview.account, permission, await countActiveSuperadmins());
	if (!result.ok) return { refused: fail(result.status, { message: result.message }) };
	return { actor, overview };
}

/** Flash and fail with a lifecycle refusal; unknown errors become a 500. */
function refusal(event: RequestEvent, err: unknown, fallback: string) {
	if (err instanceof AccountActionError || err instanceof UserHasRecordsError) {
		const status = err instanceof AccountActionError ? err.status : 409;
		setFlash({ type: 'error', message: err.message }, event);
		return fail(status, { message: err.message });
	}
	console.error(fallback, err);
	setFlash({ type: 'error', message: fallback }, event);
	return fail(500, { message: fallback });
}

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (!can(user, 'users.read')) redirect(302, '/dashboard');

	const overview = await getAccountOverview(event.params.id);
	if (!overview) error(404, 'User not found');

	return {
		overview,
		activity: can(user, 'audit.read') ? await getActivityForEntity('USERS', overview.account.id, { limit: 50 }) : null,
		can: {
			ban: can(user, 'users.ban'),
			delete: can(user, 'users.delete'),
			changeRole: can(user, 'users.changeRole'),
			revokeSessions: can(user, 'sessions.revoke'),
			impersonate: can(user, 'users.impersonate'),
			manageAdmins: can(user, 'admins.manage')
		}
	};
};

export const actions: Actions = {
	switchRole: async (event) => {
		const { actor, overview, refused } = await authorize(event, 'users.changeRole');
		if (refused) return refused;

		const formData = await event.request.formData();
		if (!hasTypedConfirmation(formData, 'SWITCH')) return fail(400, { message: 'Type SWITCH to confirm.' });
		const to = roleSwitchTarget(overview.account.role);
		if (!to || formData.get('to') !== to) return fail(400, { message: 'This account can’t be switched to that role.' });

		try {
			await switchAccountRole(overview.account.id, to, actor.id);
		} catch (err) {
			return refusal(event, err, 'There was a problem switching their role.');
		}
		setFlash(
			{
				type: 'success',
				message: `${overview.account.email} is now a ${roleLabel(to).toLowerCase()}. They were signed out and will set up their profile the next time they sign in.`
			},
			event
		);
		return { success: true };
	},

	revokeSessions: async (event) => {
		const { actor, overview, refused } = await authorize(event, 'sessions.revoke');
		if (refused) return refused;
		try {
			const count = await revokeAllSessions(overview.account.id, actor.id);
			setFlash({ type: 'success', message: count ? `Signed out of ${count} ${count === 1 ? 'session' : 'sessions'}.` : 'They had no active sessions.' }, event);
			return { success: true };
		} catch (err) {
			return refusal(event, err, 'There was a problem signing them out.');
		}
	},

	banUser: async (event) => {
		const { overview, refused } = await authorize(event, 'users.ban');
		if (refused) return refused;
		const formData = await event.request.formData();
		const reason = (formData.get('reason') as string | null)?.trim() || undefined;
		const days = Number(formData.get('days'));
		try {
			await auth.api.banUser({
				headers: event.request.headers,
				body: {
					userId: overview.account.id,
					banReason: reason,
					// banExpiresIn is seconds; omit for a permanent ban.
					...(days && days > 0 ? { banExpiresIn: days * 24 * 60 * 60 } : {})
				}
			});
			setFlash({ type: 'success', message: 'User suspended' }, event);
			return { success: true };
		} catch (err) {
			return refusal(event, err, 'Failed to suspend user');
		}
	},

	unbanUser: async (event) => {
		const { overview, refused } = await authorize(event, 'users.ban');
		if (refused) return refused;
		try {
			await auth.api.unbanUser({ headers: event.request.headers, body: { userId: overview.account.id } });
			setFlash({ type: 'success', message: 'User reinstated' }, event);
			return { success: true };
		} catch (err) {
			return refusal(event, err, 'Failed to reinstate user');
		}
	},

	anonymize: async (event) => {
		const { actor, overview, refused } = await authorize(event, 'users.delete');
		if (refused) return refused;
		if (!hasTypedConfirmation(await event.request.formData())) return fail(400, { message: 'Type DELETE to confirm.' });
		try {
			await anonymizeAccount(overview.account.id, actor.id);
		} catch (err) {
			return refusal(event, err, 'There was a problem anonymizing this account.');
		}
		setFlash({ type: 'success', message: 'Personal data removed. Their records of business were kept.' }, event);
		return { success: true };
	},

	deleteUser: async (event) => {
		const { actor, overview, refused } = await authorize(event, 'users.delete');
		if (refused) return refused;
		if (!hasTypedConfirmation(await event.request.formData())) return fail(400, { message: 'Type DELETE to confirm.' });
		try {
			await deleteAccount(overview.account.id, actor.id);
		} catch (err) {
			return refusal(event, err, 'Failed to delete user');
		}
		setFlash({ type: 'success', message: `${overview.account.email} was deleted.` }, event);
		redirect(303, '/admin/menu/users');
	}
};
