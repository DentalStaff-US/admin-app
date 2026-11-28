import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import { listCampaigns } from '$lib/server/database/queries/campaigns';
import { can } from '$lib/authz';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (!can(user, 'comms.massSend')) redirect(302, '/dashboard');

	const campaigns = await listCampaigns();
	return { campaigns };
};
