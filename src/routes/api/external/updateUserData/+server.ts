import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { userTable, type User } from '$lib/server/database/schemas/auth';
import { EmailService } from '$lib/server/email/emailService';
import { updateUser } from '$lib/server/database/queries/users';
import { USER_ROLES } from '$lib/config/constants';
import { notifyAdminsOfCandidateOnboarded } from '$lib/server/notifications/transactional';

/**
 * Last step of the candidate onboarding funnel (documents). The candidate app
 * walks profile→2, experience→3, resume→4, documents→5; reaching 5 means the
 * professional is done and waiting on admin approval.
 */
const CANDIDATE_ONBOARDING_FINAL_STEP = 5;

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const emailService = new EmailService();
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		if (!body || typeof body !== 'object') {
			return json(
				{ success: false, message: 'Invalid request body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const parsedProfile = z
			.object({
				firstName: z.string().optional(),
				lastName: z.string().optional(),
				email: z.string().email().optional(),
				avatarUrl: z.string().optional(),
				onboardingStep: z.number().optional(),
				timezone: z.string().optional(),
				completedOnboarding: z.boolean().optional()
			})
			.safeParse(body);

		if (!parsedProfile.success) {
			return json(
				{ success: false, message: 'Invalid user data', errors: parsedProfile.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}

		const newData: Partial<User> = { ...parsedProfile.data };

		const updatedUser = await updateUser(user.id, newData);

		// Candidate onboarding has no explicit "finished" flag — the candidate app
		// only advances `onboardingStep`, and the documents page (the last step)
		// pushes it to CANDIDATE_ONBOARDING_FINAL_STEP. Fire the admin alert on that
		// transition so the professional waiting on `awaiting-approval` is actually
		// surfaced to someone. Guarded on the previous value so the two calls the
		// documents page makes, or any replay, only notify once. Fire-and-forget:
		// the dispatcher swallows its own errors and onboarding must not block on
		// email delivery.
		if (
			user.role === USER_ROLES.CANDIDATE &&
			newData.onboardingStep === CANDIDATE_ONBOARDING_FINAL_STEP &&
			(user.onboardingStep ?? 0) < CANDIDATE_ONBOARDING_FINAL_STEP
		) {
			await notifyAdminsOfCandidateOnboarded(user.id);
		}

		return json(
			{
				success: true,
				message: 'User updated successfully',
				user: updatedUser
			},
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		// console.error('Error updating user data:', error);
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
