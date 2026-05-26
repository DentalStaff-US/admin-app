import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import {
	getClientCompanyByClientId,
	getClientProfilebyUserId,
	getClientStaffProfilesCount,
	getPrimaryLocationForCompany,
	inviteStaffUsersToAccount
} from '$lib/server/database/queries/clients.js';
import { updateUser } from '$lib/server/database/queries/users.js';

const newStaffInvitesSchema = z.object({
	invitees: z
		.array(
			z.object({
				email: z.string().email({ message: 'Please enter a valid email address' }),
				staffRole: z.enum(['CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_EMPLOYEE'], {
					required_error: 'Please select a staff role',
					invalid_type_error: 'Please select a valid staff role'
				})
			})
		)
		.min(1, 'Please add at least one staff member')
});

export const load = async (event) => {
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	const client = await getClientProfilebyUserId(user.id);

	const company = await getClientCompanyByClientId(client.id);

	if (!company) redirect(302, '/onboarding/client/company');

	const location = await getPrimaryLocationForCompany(company.id);

	if (!location) redirect(302, '/onboarding/client/location');

	const staffCount = await getClientStaffProfilesCount(company.id);

	const form = await superValidate(newStaffInvitesSchema);

	// if (staffCount > 0) {
	// 	redirect(302, '/dashboard');
	// }

	return {
		user,
		form
	};
};

export const actions = {
	sendInvites: async (event) => {
		// Log the raw form data first
		const formData = await event.request.formData();
		console.log('Raw form data:', Object.fromEntries(formData));

		// Parse the invitees from the form data
		const rawInvitees = formData.get('invitees');

		const user = event.locals.user;

		if (!user) {
			return fail(401);
		}

		const invitees = rawInvitees ? JSON.parse(rawInvitees.toString()) : [];

		const form = await superValidate(
			{ invitees }, // Pass the parsed data
			newStaffInvitesSchema
		);

		if (!form.valid) {
			console.log('Form validation errors:', form.errors);
			return fail(400, { form });
		}

		try {
			const { invitees } = form.data;
			const INVITE_EXPIRATION_DAYS = 7;
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRATION_DAYS);

			const client = await getClientProfilebyUserId(user?.id);
			const company = await getClientCompanyByClientId(client.id);
			const location = await getPrimaryLocationForCompany(company.id);

			if (!location) {
				throw new Error('Primary location not found');
			}

			// Format invites for our invite function
			const invites = invitees.map((invitee: { email: string; staffRole: string }) => ({
				id: crypto.randomUUID().toString(), // Generate a unique ID for each invite
				email: invitee.email.toLowerCase(),
				staffRole: invitee.staffRole,
				invitedRole: 'CLIENT_STAFF', // This is their platform role
				referrerRole: user.role as 'CANDIDATE' | 'CLIENT_STAFF' | 'SUPERADMIN' | 'CLIENT',
				referrerId: user.id,
				expiresAt: expiresAt
			}));

			// Send invites
			const results = await inviteStaffUsersToAccount(location.id, invites);

			// Check for any failures
			const failedInvites = results.filter((result) => !result.success);

			if (failedInvites.length > 0) {
				const failedEmails = failedInvites.map((f) => f.email).join(', ');
				setFlash(
					{
						type: 'error',
						message: `Some invitations could not be sent: ${failedEmails}. Please try again or contact support.`
					},
					event
				);
			} else {
				setFlash(
					{
						type: 'success',
						message: `Successfully sent ${results.length} staff invitation${results.length > 1 ? 's' : ''}.`
					},
					event
				);
			}
			// complete onboarding
			await updateUser(user.id, { completedOnboarding: true });
		} catch (error) {
			console.error('Error sending staff invites:', error);
			setFlash(
				{
					type: 'error',
					message: 'There was a problem sending the invitations. Please try again.'
				},
				event
			);

			return fail(500, {
				form,
				error: 'Failed to send invitations'
			});
		}

		// Funnel ends with the optional billing step; the billing page will
		// itself redirect to /dashboard if the client is already set up.
		redirect(302, '/onboarding/client/billing');
	},
	skipInviting: async (event) => {
		const user = event.locals.user;
		if (!user) {
			return fail(401);
		}

		console.log('User opted to skip inviting staff members.');
		try {
			// complete onboarding
			await updateUser(user.id, { completedOnboarding: true });
			setFlash(
				{
					type: 'success',
					message: 'You can invite staff members later from your account settings or staff page.'
				},
				event
			);
		} catch (error) {
			console.error('Error skipping staff invites:', error);
			setFlash(
				{
					type: 'error',
					message: 'There was a problem updating your onboarding status. Please try again.'
				},
				event
			);

			return fail(500, {
				error: 'Failed to update onboarding status'
			});
		}

		redirect(302, '/onboarding/client/billing');
	}
};
