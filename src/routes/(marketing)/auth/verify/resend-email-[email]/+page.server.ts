import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { getUserByEmail } from '$lib/server/database/queries/users';
import { logger } from '$lib/server/logger';

export const load: PageServerLoad = async (event) => {
	try {
		const email = decodeURIComponent(event.params.email) as string;
		const user = await getUserByEmail(email);

		let heading = 'Email Verification Problem';
		let message =
			'A new email could not be sent. Please contact support if you feel this was an error.';

		if (user) {
			heading = 'Email Verification Sent';
			message =
				'A new verification email was sent.  Please check your email for the message. (Check the spam folder if it is not in your inbox)';
			// Better Auth re-issues the verification link via the sendVerificationEmail
			// callback in auth.ts.
			await auth.api.sendVerificationEmail({
				headers: event.request.headers,
				body: { email, callbackURL: '/auth/verify/success' }
			});
		}
		return { heading: heading, message: message };
	} catch (e) {
		logger.error('auth.verify.resend-email failed', { error: e });
		return {
			heading: 'Email Verification Problem',
			message:
				'A new email could not be sent. Please contact support if you feel this was an error.'
		};
	}
};
