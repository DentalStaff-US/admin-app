import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { userSchema } from '$lib/config/zod-schemas';
import { auth } from '$lib/server/auth';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';

const resetPasswordSchema = userSchema.pick({ email: true });

export const load = async (event) => {
	const form = await superValidate(event, resetPasswordSchema);
	return {
		form
	};
};

export const actions = {
	default: async (event) => {
		const form = await superValidate(event, resetPasswordSchema);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		try {
			// Better Auth stores a reset token in the verification table and emails
			// the link via the sendResetPassword callback in auth.ts. It always
			// returns success (no account enumeration); the link lands on
			// /auth/password/update?token=...
			await auth.api.requestPasswordReset({
				headers: event.request.headers,
				body: {
					email: form.data.email.toLowerCase(),
					redirectTo: `${env.BASE_URL}/auth/password/update`
				}
			});
		} catch (e) {
			logger.error('auth.password.reset failed', { error: e, email: form.data.email });
			// Still redirect to success to avoid revealing whether the email exists.
		}
		redirect(302, '/auth/password/reset/success');
	}
};
