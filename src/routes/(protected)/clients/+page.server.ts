import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CLIENT_STATUS, USER_ROLES, type ClientStatus } from '$lib/config/constants';
import {
	createClientCompany,
	createClientProfile,
	getAllClientProfiles,
	getClientProfilesCount,
	getClientStatusCounts
} from '$lib/server/database/queries/clients';
import { message, superValidate } from 'sveltekit-superforms/server';
import { adminNewUserSchema } from '$lib/config/zod-schemas';
import db from '$lib/server/database/drizzle';
import { createCandidateProfile } from '$lib/server/database/queries/candidates';
import { createUser } from '$lib/server/database/queries/users';
import type { CandidateProfile } from '$lib/server/database/schemas/candidate';
import type { User } from '$lib/server/database/schemas/auth';
import { Argon2id } from 'oslo/password';
import { setFlash } from 'sveltekit-flash-message/server';
import type { ClientProfile } from '$lib/server/database/schemas/client';

export const load: PageServerLoad = async (event) => {
	const { url, locals, setHeaders } = event;

	const searchTerm = url.searchParams.get('search') || '';
	const statusParam = url.searchParams.get('status')?.toUpperCase();
	const status: ClientStatus =
		statusParam && statusParam in CLIENT_STATUS
			? (statusParam as ClientStatus)
			: CLIENT_STATUS.PENDING;

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

	const [clients, count, statusCounts, newProfileForm] = await Promise.all([
		getAllClientProfiles(searchTerm, status),
		getClientProfilesCount(),
		getClientStatusCounts(),
		superValidate(event, adminNewUserSchema)
	]);

	return {
		clients: clients || [],
		count: count || 0,
		statusCounts,
		status,
		searchTerm,
		newProfileForm
	};
};

export const actions = {
	adminCreateClient: async (event: RequestEvent) => {
		console.log('adminCreateClient called');
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
				email: formData.data.email.toLowerCase(),
				role: 'CLIENT',
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

			await db.transaction(async (tx) => {
				const user = await createUser(newUserData, tx);

				if (user) {
					const profileData: ClientProfile = {
						id: crypto.randomUUID(),
						createdAt: new Date(),
						updatedAt: new Date(),
						userId: user.id
					};

					const profile = await createClientProfile(profileData, tx);
					await createClientCompany(
						{
							id: crypto.randomUUID(),
							clientId: profileData.id,
							companyName: formData.data.companyName || 'None Specified'
						},
						tx
					);
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
		redirect(303, `/clients/${createdProfileId}`);
	}
};
