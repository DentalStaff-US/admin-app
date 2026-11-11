import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { message, superValidate } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';
import { getAdminUsers } from '$lib/server/database/queries/admin';
import { z } from 'zod';
import db from '$lib/server/database/drizzle';
import { userInviteTable } from '$lib/server/database/schemas/auth';
import { EmailService } from '$lib/server/email/emailService';
import { getUserByEmail } from '$lib/server/database/queries/users';
import { can, guardStaffInvite, STAFF_ROLES } from '$lib/authz';

/** Invite a DTSS team member as Admin (the default) or Super admin. */
const inviteSchema = z.object({
	email: z.string().email('Invalid email address'),
	role: z.enum(STAFF_ROLES).default('ADMIN')
});

export const load: PageServerLoad = async (event) => {
	const searchTerm = event.url.searchParams.get('search') || '';
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (!can(user, 'admins.manage')) {
		redirect(302, '/dashboard');
	}

	const form = await superValidate(event, inviteSchema);
	const admins = await getAdminUsers(searchTerm);

	return {
		form,
		admins: admins || []
	};
};

export const actions = {
	// Invite a team member. Deletion and role changes live on /admin/menu/admins/[id].
	default: async (event: RequestEvent) => {
		const user = event.locals.user;

		if (!user) {
			return fail(401);
		}

		const form = await superValidate(event, inviteSchema);

		if (!form.valid) {
			return fail(400, { form });
		}

		// AZ-4: only admins.manage may invite, and only to a staff role. Previously
		// this action didn't check the caller at all.
		const allowed = guardStaffInvite(user, form.data.role);
		if (!allowed.ok) {
			setFlash({ type: 'error', message: allowed.message }, event);
			return fail(allowed.status, { form });
		}

		try {
			const { email, role } = form.data;
			const INVITE_EXPIRATION_DAYS = 7;
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRATION_DAYS);
			const emailService = new EmailService();

			const invite = {
				token: crypto.randomUUID().toString(), // Unique token for the invite link
				id: crypto.randomUUID().toString(),
				email: email.toLowerCase(),
				invitedRole: role, // Their platform role: ADMIN or SUPERADMIN
				referrerRole: 'SUPERADMIN' as const, // guardStaffInvite only passes admins.manage holders
				referrerId: user.id,
				expiresAt: expiresAt
			};

			const existingUser = await getUserByEmail(email);
			if (existingUser) {
				setFlash(
					{
						type: 'error',
						message: `A user with the email ${email} already exists. Please use a different email address.`
					},
					event
				);
				return fail(400, { form });
			}
			// Send invite. The email must carry the same token that we stored
			// on the invite row — otherwise the lookup at /auth/invite/[token]
			// returns nothing and the link reads as "Invalid Invitation".
			await db.transaction(async (tx) => {
				await tx.insert(userInviteTable).values(invite);

				try {
					await emailService.sendAdminUserInviteEmail(email, invite.token);
				} catch (emailError) {
					console.error('Error sending invite email:', emailError);
					throw new Error('Failed to send invitation email');
				}
			});
			setFlash(
				{
					type: 'success',
					message: `Invitation sent to ${email}`
				},
				event
			);
			return message(form, 'Invitation sent successfully');
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
	}
};
