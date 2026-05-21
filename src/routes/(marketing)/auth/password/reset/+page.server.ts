import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { userSchema } from '$lib/config/zod-schemas';
import { EmailService } from '$lib/server/email/emailService';
import { getUserByEmail, updateUser } from '$lib/server/database/queries/users';
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
		const emailService = new EmailService();

		try {
			const user = await getUserByEmail(form.data.email);
			if (!user) {
				return setError(form, 'The email address does not have an account.');
			}
			const token = crypto.randomUUID();
			await updateUser(user.id, { token: token });
			const sendResult = await emailService.sendPasswordResetEmail(form.data.email, token);
			if (!sendResult.success) {
				logger.error('password reset email send failed', {
					error: sendResult.error,
					distinctId: user.id,
					email: form.data.email
				});
				return setError(
					form,
					'There was a problem sending the password reset email. Please contact support if you need further help.'
				);
			}
		} catch (e) {
			logger.error('auth.password.reset failed', { error: e, email: form.data.email });
			return setError(
				form,
				'The was a problem resetting your password. Please contact support if you need further help.'
			);
		}
		redirect(302, '/auth/password/reset/success');
	}
};
