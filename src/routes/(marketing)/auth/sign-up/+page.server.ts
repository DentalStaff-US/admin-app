import { fail, redirect } from '@sveltejs/kit';
import { REF_COOKIE_NAME } from '$lib/server/affiliate/cookie';
import { resolveReferralForSignup } from '$lib/server/affiliate/signup';
import { applyAttribution } from '$lib/server/database/queries/affiliates';
import { setFlash } from 'sveltekit-flash-message/server';
import { setError, superValidate } from 'sveltekit-superforms/server';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth/api';

import { userSchema } from '$lib/config/zod-schemas';
import db from '$lib/server/database/drizzle';
import { desc, eq } from 'drizzle-orm';
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

			// The invite cookie is ours but unsigned, so its role is never trusted:
			// re-read the invite row by token and take the role from there. A forged
			// cookie could otherwise sign anyone up as SUPERADMIN.
			if (inviteData) {
				const [row] = await db
					.select({
						email: userInviteTable.email,
						invitedRole: userInviteTable.invitedRole,
						companyId: userInviteTable.companyId,
						staffRole: userInviteTable.staffRole,
						expiresAt: userInviteTable.expiresAt
					})
					.from(userInviteTable)
					.where(eq(userInviteTable.token, String(inviteData.token ?? '')))
					.limit(1);
				if (!row || new Date() > new Date(row.expiresAt) || row.email.toLowerCase() !== form.data.email.toLowerCase()) {
					setFlash({ type: 'error', message: 'This invitation is invalid or has expired.' }, event);
					return setError(form, 'email', 'This invitation is invalid or has expired.');
				}
				// Same for the locations, which decide what they can see. Primary first.
				const granted = await db
					.select({ locationId: companyStaffInviteLocations.locationId })
					.from(companyStaffInviteLocations)
					.where(eq(companyStaffInviteLocations.token, String(inviteData.token ?? '')))
					.orderBy(desc(companyStaffInviteLocations.isPrimary));
				inviteData = {
					...inviteData,
					invitedRole: row.invitedRole,
					companyId: row.companyId,
					staffRole: row.staffRole,
					locations: granted.map((g) => g.locationId)
				};
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

			// Resolve the affiliate referral before opening the transaction — the
			// decision needs DB reads, but the WRITE belongs inside the transaction
			// below so a user is either fully set up and attributed, or neither.
			const referral = await resolveReferralForSignup({
				cookieValue: event.cookies.get(REF_COOKIE_NAME),
				urlCode: event.url.searchParams.get('ref'),
				hasInvite: Boolean(inviteData),
				signupUserId: newUserId,
				signupEmail: email,
				signupRole: role
			});

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
							inviteData.locations.map((locationId: string, i: number) => ({
								id: crypto.randomUUID(),
								companyId: inviteData.companyId,
								staffId: staffProfile.id,
								locationId,
								isPrimary: i === 0
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

				await applyAttribution(referral, { referredUserId: newUserId, referredRole: role }, tx);
			});

			// Clear invite cookies.
			if (staffInviteCookie) event.cookies.delete('staff_invite', { path: '/' });
			if (adminInviteCookie) event.cookies.delete('admin_invite', { path: '/' });
			// The referral is permanent in the DB now; the cookie has done its job.
			event.cookies.delete(REF_COOKIE_NAME, { path: '/' });

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
