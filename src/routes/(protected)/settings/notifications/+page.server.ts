import { redirect, fail, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { getUserById, updateUser } from '$lib/server/database/queries/users';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');

	const record = await getUserById(user.id);
	return {
		receiveEmail: record?.user.receiveEmail ?? true,
		receiveSms: record?.user.receiveSms ?? true
	};
};

export const actions = {
	default: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const fd = await event.request.formData();
		// Unchecked checkboxes are absent from the payload → false.
		const receiveEmail = fd.get('receiveEmail') === 'on';
		const receiveSms = fd.get('receiveSms') === 'on';

		await updateUser(user.id, { receiveEmail, receiveSms });
		setFlash({ type: 'success', message: 'Notification preferences updated.' }, event);
		return { success: true, receiveEmail, receiveSms };
	}
};
