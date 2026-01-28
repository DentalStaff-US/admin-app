import { fail, redirect } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import {
	deleteAdminUser,
	getAdminUserById,
	updateAdminUserProfile
} from '$lib/server/database/queries/admin';
import { z } from 'zod';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import { setFlash } from 'sveltekit-flash-message/server';

const UpdateAdmimProfileSchema = z.object({
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().email()
});

export const load = async (event) => {
	const user = event.locals.user;

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	if (user?.role !== USER_ROLES.SUPERADMIN) {
		redirect(301, '/dashboard');
	}

	const profile = await getAdminUserById(event.params.id);

	const profileForm = await superValidate(event, UpdateAdmimProfileSchema);

	profileForm.data = {
		firstName: profile?.firstName,
		lastName: profile?.lastName,
		email: profile?.email
	};

	return {
		user,
		profile,
		updateAdminForm: profileForm
	};
};

export const actions = {
	deleteAdminUser: async (event) => {
		const user = event.locals.user;
		if (user?.role !== USER_ROLES.SUPERADMIN) {
			redirect(301, '/dashboard');
		}

		const { id } = event.params;

		if (id === user.id) {
			return fail(400, { message: 'You cannot delete your own account.' });
		}

		try {
			deleteAdminUser(id);
			setFlash({ type: 'success', message: 'User deleted successfully.' }, event);
		} catch (err) {
			console.error('Error deleting user:', err);
			setFlash({ type: 'error', message: 'There was a problem deleting user.' }, event);
			return fail(500);
		}
		redirect(301, '/admin/menu/admins');
	},
	updateAdminProfile: async (event) => {
		const user = event.locals.user;
		if (user?.role !== USER_ROLES.SUPERADMIN) {
			redirect(301, '/dashboard');
		}

		const form = await superValidate(event, UpdateAdmimProfileSchema);
		console.log('Updating admin profile', form);
		if (!form.valid) {
			console.log('form errors', form.errors);
			return fail(400, { updateAdminForm: form });
		}

		const updates = form.data;
		console.log('updates', updates);

		try {
			await updateAdminUserProfile(event.params.id, updates);
			setFlash({ type: 'success', message: 'Admin details updated successfully.' }, event);
			return message(form, 'Admin details updated successfully.');
		} catch (e) {
			console.error('Error updating admin details:', e);
			setFlash({ type: 'error', message: 'There was a problem updating admin details.' }, event);
			return setError(form, 'There was a problem updating admin details.');
		}
	}
};
