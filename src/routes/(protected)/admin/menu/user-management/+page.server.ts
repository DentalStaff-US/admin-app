import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { USER_ROLES } from '$lib/config/constants.js';

import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { getUserByEmail } from '$lib/server/database/queries/users';
import { userTable, type User } from '$lib/server/database/schemas/auth';
import { Argon2id } from 'oslo/password';
import db from '$lib/server/database/drizzle';
import type {
	ClientCompany,
	ClientCompanyLocation,
	ClientProfile
} from '$lib/server/database/schemas/client';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(301, '/login');
	}

	if (locals.user.role !== USER_ROLES.SUPERADMIN) {
		redirect(301, '/dashboard');
	}
};

type UserRole = 'SUPERADMIN' | 'CLIENT' | 'CANDIDATE';

interface ImportUser {
	firstName: string;
	lastName: string;
	email: string;
	companyName?: string;
	companyLogo?: string;
	baseLocation?: string;
	address?: string;
	hourlyRateMin?: number;
	hourlyRateMax?: number;
}

export const actions: Actions = {
	importUsers: async ({ request }) => {
		const formData = await request.formData();
		const role = formData.get('role') as UserRole;
		const usersJson = formData.get('users') as string;

		if (!role || !usersJson) {
			return fail(400, { error: 'Missing required data' });
		}

		let users: ImportUser[];
		try {
			users = JSON.parse(usersJson);
		} catch (e) {
			return fail(400, { error: 'Invalid user data' });
		}

		const results = {
			success: 0,
			skipped: 0,
			errors: [] as string[]
		};

		// Process each user
		for (const user of users) {
			try {
				// Check if user already exists
				const existingUser = await getUserByEmail(user.email);

				if (existingUser) {
					results.skipped++;
					results.errors.push(`${user.email} - already exists`);
					continue;
				}

				// Create user based on role
				await createUser(user, role);
				results.success++;
			} catch (error) {
				results.errors.push(
					`${user.email} - ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		}

		return { success: true, ...results };
	}
};

async function createUser(user: any, role: keyof typeof USER_ROLES): Promise<User | void> {
	console.log('Creating user:', user, 'with role:', role);

	if (role === 'SUPERADMIN') {
		const newUserData: User = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			role,
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
			password: await new Argon2id().hash('dtssadminuser')
		};

		const [newUser] = await db.insert(userTable).values(newUserData).returning();

		return newUser;
	}

	if (role === 'CLIENT') {
		const newUserData: User = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			firstName: user.firstName,
			lastName: user.lastName,
			email: user.email,
			role,
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
			password: await new Argon2id().hash('dtssclientuser')
		};

		const newProfileData: ClientProfile = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			userId: newUserData.id
		};

		const newBusinessData: ClientCompany = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			clientId: newProfileData.id,
			companyName: user.companyName,
			companyLogo: user.companyLogo,
			baseLocation: `${user.city}, ${user.state}`
		};

		const newLocationData: ClientCompanyLocation = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			email: user.email,
			streetOne: user.address,
			streetTwo: user.addressTwo,
			city: user.city,
			state: user.state,
			zipcode: user.zipcode,
			companyPhone: user.companyPhone,
			cellPhone: user.cellPhone,
			companyId: newBusinessData.id,
			name: `${newBusinessData.companyName} - ${user.city}`
		};

		console.log({
			newUserData,
			newBusinessData,
			newLocationData,
			newProfileData
		});
	}
	return;
}
