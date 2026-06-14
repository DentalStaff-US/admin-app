import { fail, redirect } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

import { userSchema } from '$lib/config/zod-schemas';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import {
	companyStaffInviteLocations,
	userInviteTable,
	userTable
} from '$lib/server/database/schemas/auth';
import {
	clientStaffLocationTable,
	clientStaffProfileTable
} from '$lib/server/database/schemas/client.js';
import { getClientIdByCompanyId } from '$lib/server/database/queries/clients.js';
import type { PageServerLoad, RequestEvent } from './$types';
import { getUserTimezone } from '$lib/_helpers/UTCTimezoneUtils';
import { USER_ROLES } from '$lib/config/constants';
import { logger } from '$lib/server/logger';

const signUpSchema = userSchema.pick({
	firstName: true,
	lastName: true,
	email: true,
	password: true,
	terms: true
});

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		redirect(302, '/dashboard');
	}

	const queryParams = event.url.searchParams;
	const email = queryParams.get('email');
	const invite = Boolean(queryParams.get('invite'));

	const form = await superValidate(event, signUpSchema);

	if (email && invite) {
		form.data.email = email;
	}

	return {
		signupForm: form
	};
};

export const actions = {
	default: async (event: RequestEvent) => {
		const form = await superValidate(event, signUpSchema);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}

		try {
			let inviteData = null;

			// Check for staff / admin invite cookies (admin takes precedence).
			const staffInviteCookie = event.cookies.get('staff_invite');
			const adminInviteCookie = event.cookies.get('admin_invite');
			if (adminInviteCookie) {
				inviteData = await JSON.parse(adminInviteCookie);
			} else if (staffInviteCookie) {
				inviteData = await JSON.parse(staffInviteCookie);
			}

			// Verify the invite email matches the registration email.
			if (inviteData && inviteData?.email?.toLowerCase() !== form.data?.email?.toLowerCase()) {
				setFlash(
					{
						type: 'error',
						message: 'The email address does not match the invitation.'
					},
					event
				);
				return setError(form, 'email', 'Please use the email address from your invitation.');
			}

			const email = form.data.email.toLowerCase();
			// Invited users get their invited role + are auto-verified (they arrived
			// via an email link) and skip onboarding; everyone else is a CLIENT.
			const role = inviteData ? inviteData.invitedRole : USER_ROLES.CLIENT;
			const verified = Boolean(inviteData);
			const completedOnboarding = Boolean(inviteData);

			// Create the user + credential account + session via Better Auth.
			// The custom Argon2id hasher in auth.ts is used for the password.
			// sveltekitCookies sets the session cookie automatically.
			const signUpResult = await auth.api.signUpEmail({
				headers: event.request.headers,
				body: {
					email,
					password: form.data.password,
					name: `${form.data.firstName} ${form.data.lastName}`.trim(),
					firstName: form.data.firstName,
					lastName: form.data.lastName
				}
			});

			const newUserId = signUpResult.user.id;

			// Apply the fields Better Auth signUp can't set directly (role is
			// admin-plane; verified/onboarding are input:false), plus invite setup.
			await db.transaction(async (tx) => {
				await tx
					.update(userTable)
					.set({
						role,
						verified,
						completedOnboarding,
						timezone: getUserTimezone(),
						updatedAt: new Date()
					})
					.where(eq(userTable.id, newUserId));

				if (inviteData) {
					if (inviteData.invitedRole === USER_ROLES.CLIENT_STAFF) {
						const clientId = await getClientIdByCompanyId(inviteData.companyId);
						if (!clientId) {
							throw new Error(`No client found for company ID: ${inviteData.companyId}`);
						}

						const [staffProfile] = await tx
							.insert(clientStaffProfileTable)
							.values({
								id: crypto.randomUUID(),
								userId: newUserId,
								companyId: inviteData.companyId,
								clientId: clientId,
								staffRole: inviteData.staffRole
							})
							.returning();

						await tx.insert(clientStaffLocationTable).values(
							inviteData.locations.map((locationId: string) => ({
								id: crypto.randomUUID(),
								companyId: inviteData.companyId,
								staffId: staffProfile.id,
								locationId,
								isPrimary: true
							}))
						);

						await tx
							.update(companyStaffInviteLocations)
							.set({ token: null })
							.where(eq(companyStaffInviteLocations.token, inviteData.token));
					}
					// Mark the invite as used.
					await tx
						.update(userInviteTable)
						.set({ token: null })
						.where(eq(userInviteTable.token, inviteData.token));
				}
			});

			// Clear invite cookies.
			if (staffInviteCookie) event.cookies.delete('staff_invite', { path: '/' });
			if (adminInviteCookie) event.cookies.delete('admin_invite', { path: '/' });

			logger.event('user_signed_up', {
				distinctId: newUserId,
				role,
				via_invite: Boolean(inviteData),
				invited_role: inviteData?.invitedRole ?? null,
				$set: { role }
			});

			if (inviteData) {
				setFlash(
					{ type: 'success', message: 'Account created successfully. Welcome to the team!' },
					event
				);
			} else {
				// Non-invited users must verify their email — Better Auth issues the
				// link via the sendVerificationEmail callback in auth.ts.
				try {
					await auth.api.sendVerificationEmail({
						headers: event.request.headers,
						body: { email, callbackURL: '/auth/verify/success' }
					});
				} catch (err) {
					logger.error('verification email send failed at signup', {
						error: err,
						distinctId: newUserId,
						email
					});
				}
				setFlash(
					{
						type: 'success',
						message: 'Account created. Please check your email to verify your account.'
					},
					event
				);
			}
		} catch (e) {
			// Better Auth surfaces duplicate email / weak password as APIError.
			if (e instanceof APIError) {
				logger.error('auth.sign-up failed', { error: e.message, email: form.data.email });
				return setError(form, 'email', 'A user with that email already exists.');
			}
			logger.error('auth.sign-up failed', { error: e, email: form.data.email });
			setFlash({ type: 'error', message: 'Account was not able to be created.' }, event);
			return setError(form, 'email', 'A user with that email already exists.');
		}
		return { form };
	}
};
