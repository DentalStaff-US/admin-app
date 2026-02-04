import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import {
	createCandidateProfile,
	getAllCandidateProfiles
} from '$lib/server/database/queries/candidates';
import { message, superValidate } from 'sveltekit-superforms/server';
import { Argon2id } from 'oslo/password';
import type { User } from '$lib/server/database/schemas/auth';
import { createUser } from '$lib/server/database/queries/users';
import db from '$lib/server/database/drizzle';
import type { CandidateProfile } from '$lib/server/database/schemas/candidate';
import { adminNewUserSchema } from '$lib/config/zod-schemas';
import { setFlash } from 'sveltekit-flash-message/server';

export const load: PageServerLoad = async (event) => {
	const { url, locals, setHeaders } = event;
	const searchTerm = url.searchParams.get('search')?.toString();

	setHeaders({
		'cache-control': 'max-age=60'
	});

	const user = locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (user.role !== USER_ROLES.SUPERADMIN) {
		redirect(302, '/dashboard');
	}

	const results = await getAllCandidateProfiles(searchTerm);
	const newProfileForm = await superValidate(event, adminNewUserSchema);

	return {
		candidates: results?.candidates || [],
		count: results?.count || 0,
		searchTerm: searchTerm || '',
		newProfileForm
	};
};

export const actions = {
	adminCreateProfessional: async (event: RequestEvent) => {
		console.log('adminCreateProfessional called');
		const { user } = event.locals;
		if (!user) {
			return fail(401);
		}

		if (user.role !== USER_ROLES.SUPERADMIN) {
			return fail(403, { message: 'Unauthorized' });
		}

		const formData = await superValidate(event, adminNewUserSchema);

		if (!formData.valid) {
			console.log('failure', formData);
			return fail(400, { form: formData, message: 'Invalid Form Data' });
		}

		let createdProfileId: string | null = null;

		try {
			const newUserData: User = {
				id: crypto.randomUUID(),
				createdAt: new Date(),
				updatedAt: new Date(),
				firstName: formData.data.firstName,
				lastName: formData.data.lastName,
				email: formData.data.email,
				role: 'CANDIDATE',
				completedOnboarding: true,
				verified: true,
				receiveEmail: true,
				provider: '',
				providerId: '',
				avatarUrl: null,
				onboardingStep: null,
				blacklisted: false,
				stripeCustomerId: null,
				timezone: null,
				token: crypto.randomUUID(),
				password: await new Argon2id().hash(formData.data.password)
			};

			console.log({ newUserData });

			await db.transaction(async (tx) => {
				const user = await createUser(newUserData, tx);

				if (user) {
					const profileData: CandidateProfile = {
						id: crypto.randomUUID(),
						createdAt: new Date(),
						updatedAt: new Date(),
						userId: user.id,
						status: 'ACTIVE'
					};

					const profile = await createCandidateProfile(profileData, tx);
					createdProfileId = profile.id;
				}
			});
			setFlash({ type: 'success', message: 'Profile Created sucessfully' }, event);
			message(formData, { message: 'Profile created successfully' });
		} catch (err) {
			console.log(err);
			setFlash({ type: 'success', message: 'Profile creation unsuccessful' }, event);
			message(formData, { message: 'Profile creation unsuccessful' });
			return fail(500, { form: formData });
		}
		redirect(303, `/professionals/${createdProfileId}`);
	}
};
