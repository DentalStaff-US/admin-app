import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { userResetPasswordSchema } from '$lib/config/zod-schemas';
import { getUserByToken, updateUser } from '$lib/server/database/queries/users';
import { Argon2id } from 'oslo/password';
import { logger } from '$lib/server/logger';
export const load = async (event) => {
	const form = await superValidate(event, userResetPasswordSchema);
	return {
		form
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

		try {
			const token = event.params.token as string;
			const newToken = crypto.randomUUID();
			const user = await getUserByToken(token);

			if (user) {
				const password = await new Argon2id().hash(form.data.password);
				// need to update with new token because token is also used for verification
				// and needs a new verification token in case user has not verified their account
				// and already forgot their password before verifying. Now they can get a new one resent.
				await updateUser(user.id, { token: newToken, password: password });
			} else {
				return setError(
					form,
					'Email address not found for this token. Please contact support if you need further help.'
				);
			}
		} catch (e) {
			logger.error('auth.password.update failed', { error: e });
			return setError(
				form,
				'The was a problem resetting your password. Please contact support if you need further help.'
			);
		}
		const token = event.params.token as string;
		redirect(302, `/auth/password/update-${token}/success`);
		//		return { form };
	}
};
