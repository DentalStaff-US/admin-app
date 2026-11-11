import { error, fail, redirect } from '@sveltejs/kit';
import {
	countActiveSuperadmins,
	deleteAdminUser,
	getAdminUserById,
	setStaffRole,
	updateAdminUserProfile
} from '$lib/server/database/queries/admin';
import { z } from 'zod';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';
import { hasTypedConfirmation } from '$lib/server/confirmation';
import { can, guardStaffChange, staffRoleLabel, type StaffChange } from '$lib/authz';
import { recordAction } from '$lib/server/audit/audit';

const UpdateAdmimProfileSchema = z.object({
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().email()
});

type Actor = NonNullable<App.Locals['user']>;

/**
 * Load the staff member and run the AZ-4 guard for `change`. Returns the
 * target, or the refusal to hand straight back to the client.
 */
async function guarded(actor: Actor, id: string, change: StaffChange) {
	const target = await getAdminUserById(id);
	if (!target) return { refused: fail(404, { message: 'Admin not found.' }) };
	const result = guardStaffChange(actor, target, change, await countActiveSuperadmins());
	if (!result.ok) return { refused: fail(result.status, { message: result.message }) };
	return { target };
}

export const load = async (event) => {
	const user = event.locals.user;

	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	if (!can(user, 'admins.manage')) {
		redirect(302, '/dashboard');
	}

	const profile = await getAdminUserById(event.params.id);
	if (!profile) error(404, 'Admin not found');

	const profileForm = await superValidate(event, UpdateAdmimProfileSchema);

	profileForm.data = {
		firstName: profile.firstName ?? '',
		lastName: profile.lastName ?? '',
		email: profile.email
	};

	return {
		user,
		profile,
		// For the last-SUPERADMIN guard in the UI; the actions re-check.
		superadminCount: await countActiveSuperadmins(),
		updateAdminForm: profileForm
	};
};

export const actions = {
	deleteAdminUser: async (event) => {
		const user = event.locals.user;
		if (!user || !can(user, 'admins.manage')) {
			redirect(302, '/dashboard');
		}

		const { id } = event.params;

		if (id === user.id) {
			return fail(400, { message: 'You cannot delete your own account.' });
		}
		// Hard delete: refuse unless DELETE was typed in the confirmation dialog.
		if (!hasTypedConfirmation(await event.request.formData())) {
			return fail(400, { message: 'Type DELETE to confirm.' });
		}
		const { refused } = await guarded(user, id, { kind: 'remove' });
		if (refused) return refused;

		try {
			// Awaited so a failure (e.g. UserHasRecordsError) lands in the catch.
			await deleteAdminUser(id);
			setFlash({ type: 'success', message: 'User deleted successfully.' }, event);
		} catch (err) {
			console.error('Error deleting user:', err);
			setFlash({ type: 'error', message: 'There was a problem deleting user.' }, event);
			return fail(500);
		}
		redirect(303, '/admin/menu/admins');
	},

	/** Switch a team member between Admin and Super admin, within the AZ-4 guards. */
	setRole: async (event) => {
		const user = event.locals.user;
		if (!user || !can(user, 'admins.manage')) {
			return fail(403, { message: 'Only a super admin can change roles.' });
		}

		const role = String((await event.request.formData()).get('role') ?? '');
		const { target, refused } = await guarded(user, event.params.id, { kind: 'setRole', role });
		if (refused) return refused;
		if (target.role === role) return { success: true };

		try {
			await setStaffRole(target.id, role as 'ADMIN' | 'SUPERADMIN');
			await recordAction({
				entityType: 'USERS',
				entityId: target.id,
				action: 'UPDATE',
				actor: user.id,
				before: { role: target.role },
				after: { role },
				metadata: { change: 'STAFF_ROLE' }
			});
			setFlash({ type: 'success', message: `${target.email} is now ${staffRoleLabel(role).toLowerCase()}.` }, event);
			return { success: true };
		} catch (err) {
			console.error('Error changing admin role:', err);
			setFlash({ type: 'error', message: 'There was a problem changing their role.' }, event);
			return fail(500, { message: 'There was a problem changing their role.' });
		}
	},

	updateAdminProfile: async (event) => {
		const user = event.locals.user;
		if (!user || !can(user, 'admins.manage')) {
			redirect(302, '/dashboard');
		}

		const form = await superValidate(event, UpdateAdmimProfileSchema);
		if (!form.valid) {
			return fail(400, { updateAdminForm: form });
		}

		const { refused } = await guarded(user, event.params.id, { kind: 'edit' });
		if (refused) return refused;

		try {
			await updateAdminUserProfile(event.params.id, form.data);
			setFlash({ type: 'success', message: 'Admin details updated successfully.' }, event);
			return message(form, 'Admin details updated successfully.');
		} catch (e) {
			console.error('Error updating admin details:', e);
			setFlash({ type: 'error', message: 'There was a problem updating admin details.' }, event);
			return setError(form, 'There was a problem updating admin details.');
		}
	}
};
