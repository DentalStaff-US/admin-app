import { redirect, fail, type RequestEvent } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { getUserById, updateUser } from '$lib/server/database/queries/users';
import { getAffiliateSettingsStatus } from '$lib/server/affiliate/status';
import { PARTNER_PORTAL_URL } from '$lib/config/portal';
import { USER_ROLES } from '$lib/config/constants';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');

	const record = await getUserById(user.id);

	// Only for the settings nav's affiliate row, as on /settings. Never throws.
	const isPractice = user.role === USER_ROLES.CLIENT || user.role === USER_ROLES.CLIENT_STAFF;
	const affiliateStatus = isPractice
		? await getAffiliateSettingsStatus(user.id, user.role, PARTNER_PORTAL_URL).catch(() => null)
		: null;

	return {
		receiveEmail: record?.user.receiveEmail ?? true,
		receiveSms: record?.user.receiveSms ?? true,
		affiliateVisible: Boolean(affiliateStatus?.programEnabled && affiliateStatus?.eligible)
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
