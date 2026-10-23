import {
	getAllClientLocationsByCompanyId,
	getAllClientStaffProfiles,
	getAllClientStaffProfilesForLocation,
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getClientStaffProfilebyUserId,
	getPaginatedClientStaffProfiles
} from '$lib/server/database/queries/clients';
import { USER_ROLES } from '$lib/config/constants.js';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { superValidate } from 'sveltekit-superforms/server';
import { redirectIfNotValidCustomer } from '$lib/server/database/queries/billing';
import { z } from 'zod';
import { getUserByEmail } from '$lib/server/database/queries/users';

export const load = async (event: RequestEvent) => {
	const user = event.locals.user;
	const searchTerm = event.url.searchParams.get('search') || '';

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	if (user.role === USER_ROLES.SUPERADMIN) {
		return redirect(302, '/dashboard');
	}

	const inviteForm = await superValidate(
		event,
		z.object({
			email: z.string().email().min(1, 'Email is required'),
			locationId: z.string().min(1, 'Location ID is required'),
			staffRole: z.string().min(1, 'Staff role is required')
		})
	);

	if (user.role === USER_ROLES.CLIENT) {
		if (!user.completedOnboarding) {
			redirect(302, '/onboarding/client/company');
		}
		const client = await getClientProfilebyUserId(user.id);
		await redirectIfNotValidCustomer(client.id, user.role);
		const company = await getClientCompanyByClientId(client.id);
		const locations = await getAllClientLocationsByCompanyId(company.id);

		const staffList = await getAllClientStaffProfiles(company.id, searchTerm);

		return {
			user,
			staff: staffList,
			locations,
			company,
			inviteForm,
			searchTerm
		};
	}

	if (user.role === USER_ROLES.CLIENT_STAFF) {
		const profile = await getClientStaffProfilebyUserId(user.id);

		await redirectIfNotValidCustomer(profile.clientId, user.role);
		const staffList = await getAllClientStaffProfiles(profile.clientId, searchTerm);
		const company = await getClientCompanyByClientId(profile.clientId);

		const locations = await getAllClientLocationsByCompanyId(profile.companyId);
		return {
			user,
			staff: staffList,
			locations,
			company,
			inviteForm,
			searchTerm
		};
	}
};

export const actions = {
	inviteStaff: async (event: RequestEvent) => {
		// TODO: Check if user already exists
		// TODO: If user exists, check if they are already a staff member
		// TODO: Create Staff Invite
		const user = event.locals.user;
		if (!user) {
			return error(401, 'Unauthorized');
		}

		const form = await superValidate(
			event,
			z.object({
				email: z.string().email().min(1, 'Email is required'),
				locationId: z.string().min(1, 'Location ID is required'),
				staffRole: z.string().min(1, 'Staff role is required')
			})
		);
		const existingUser = await getUserByEmail(form.data.email.toLowerCase());
		if (existingUser) {
			const existingStaffProfile = await getClientStaffProfilebyUserId(existingUser.id);
			if (existingStaffProfile) {
				setFlash(
					{
						type: 'error',
						message: 'This user is already a staff member.'
					},
					event
				);
				return {
					form,
					error: 'This user is already a staff member.'
				};
			}
		}

		const INVITE_EXPIRATION_DAYS = 7;
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRATION_DAYS);

		const data = {
			id: crypto.randomUUID().toString(), // Generate a unique ID for each invite
			email: form.data.email.toLowerCase(),
			staffRole: form.data.staffRole,
			invitedRole: 'CLIENT_STAFF', // This is their platform role
			referrerRole: user.role as keyof typeof USER_ROLES,
			referrerId: user.id,
			expiresAt: expiresAt
		};

	},
	removeStaff: async (event: RequestEvent) => {
		// TODO: Revoke any existing invites
		// TODO: Remove staff profile
		// TODO: Remove any location relations to that staff
		// TODO: Remove User data
	}
};
