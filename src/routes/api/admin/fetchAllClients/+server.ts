import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import { getAllClientProfiles } from '$lib/server/database/queries/clients';
import { can } from '$lib/authz';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (!can(user, 'practices.manage')) {
		error(401, 'Unauthorized role, no access allowed.');
	}

	const clients = await getAllClientProfiles();

	return json(clients);
};
