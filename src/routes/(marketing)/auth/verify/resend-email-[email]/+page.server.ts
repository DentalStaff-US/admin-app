import type { PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { EmailService } from '$lib/server/email/emailService';
import { getUserByEmail, updateUser } from '$lib/server/database/queries/users';
import { logger } from '$lib/server/logger';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const emailService = new EmailService();
		const email = decodeURIComponent(params.email) as string;

		const user = await getUserByEmail(email);
		let heading = 'Email Verification Problem';
		let message =
			'A new email could not be sent. Please contact support if you feel this was an error.';

		if (user) {
			heading = 'Email Verification Sent';
			message =
				'A new verification email was sent.  Please check your email for the message. (Check the spam folder if it is not in your inbox)';
			await updateUser(user.id, { verified: false });
			if (user.token) {
				// sendVerificationEmail(user.email, user.token);
				await emailService.sendVerificationEmail(user.email, user.token);
			}
		}
		return { heading: heading, message: message };
	} catch (e) {
		logger.error('auth.verify.resend-email failed', { error: e });
		return fail(500, {
			error: 'Failed to resend verification email'
		});
	}
};
