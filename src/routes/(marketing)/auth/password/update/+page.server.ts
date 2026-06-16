import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';
import { userResetPasswordSchema } from '$lib/config/zod-schemas';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';
import { logger } from '$lib/server/logger';

export const load = async (event) => {
	const form = await superValidate(event, userResetPasswordSchema);
	// Better Auth appends ?token=... (and ?error=... on an invalid/expired link).
	const token = event.url.searchParams.get('token');
	const linkError = event.url.searchParams.get('error');
	return {
		form,
		hasToken: Boolean(token) && !linkError
	};
};

export const actions = {
	default: async (event) => {
		const form = await superValidate(event, userResetPasswordSchema);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		const token = event.url.searchParams.get('token');
		if (!token) {
			return setError(
				form,
				'This password reset link is invalid or has expired. Please request a new one.'
			);
		}

		try {
			// Better Auth re-hashes with our custom Argon2id hasher and updates the
			// credential row in the account table.
			await auth.api.resetPassword({
				headers: event.request.headers,
				body: { token, newPassword: form.data.password }
			});
		} catch (e) {
			if (e instanceof APIError) {
				return setError(
					form,
					'This password reset link is invalid or has expired. Please request a new one.'
				);
			}
			logger.error('auth.password.update failed', { error: e });
			return setError(
				form,
				'There was a problem resetting your password. Please contact support if you need further help.'
			);
		}

		setFlash(
			{ type: 'success', message: 'Your password has been updated. Please sign in.' },
			event
		);
		redirect(302, '/auth/sign-in');
	}
};
