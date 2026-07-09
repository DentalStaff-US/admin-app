import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, RequestEvent } from './$types';
import { setFlash } from 'sveltekit-flash-message/server';
import { USER_ROLES } from '$lib/config/constants';
import {
	getCampaignById,
	getCampaignRecipients,
	cancelCampaign,
	retryFailedRecipients
} from '$lib/server/database/queries/campaigns';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (user.role !== USER_ROLES.SUPERADMIN) redirect(302, '/dashboard');

	const campaign = await getCampaignById(event.params.id);
	if (!campaign) error(404, 'Mass notification not found');

	const recipients = await getCampaignRecipients(campaign.id);
	return { campaign, recipients };
};

export const actions = {
	cancel: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Unauthorized' });
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { message: 'Unauthorized' });

		const ok = await cancelCampaign(event.params.id);
		setFlash(
			ok
				? { type: 'success', message: 'Mass notification cancelled.' }
				: { type: 'error', message: 'This mass notification can no longer be cancelled.' },
			event
		);
		return { success: ok };
	},

	retry: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) return fail(401, { message: 'Unauthorized' });
		if (user.role !== USER_ROLES.SUPERADMIN) return fail(403, { message: 'Unauthorized' });

		const count = await retryFailedRecipients(event.params.id);
		setFlash(
			count > 0
				? { type: 'success', message: `Re-queued ${count} failed recipient(s) — sending shortly.` }
				: { type: 'error', message: 'No failed recipients to retry.' },
			event
		);
		return { success: count > 0 };
	}
};
