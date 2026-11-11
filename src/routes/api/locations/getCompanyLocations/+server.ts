import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import {
	getAllClientLocationsByCompanyId,
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;

	if (
		!user ||
		(!checkIsAdmin(user.role) &&
		user?.role !== USER_ROLES.CLIENT &&
		user.role !== USER_ROLES.CLIENT_STAFF)
	) {
		error(401, 'Unauthorized role, no access allowed.');
	}

	const client =
		user?.role === USER_ROLES.CLIENT_STAFF
			? await getClientProfileByStaffUserId(user.id)
			: await getClientProfilebyUserId(user.id);

	const company = client ? await getClientCompanyByClientId(client.id) : null;
	const companyId = company?.id;

	if (!companyId) {
		error(400, 'No companyId provided');
	}

	const locations = await getAllClientLocationsByCompanyId(companyId);

	return json(locations);
};
