import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { USER_ROLES } from '$lib/config/constants';
import {
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getLocationByIdForCompany
} from '$lib/server/database/queries/clients';
import { getRequisitionDetailsById } from '$lib/server/database/queries/requisitions';
import { getClientProfileByIdAdmin } from '$lib/server/database/queries/admin';
import { getQualifiedProfessionalsForRequisition } from '$lib/server/database/queries/candidates';
import { assertCanAccessLocation } from '$lib/server/scoping';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = locals.user;
	if (!user) error(401, 'Not authenticated');

	const requisitionId = Number(params.id);
	if (!Number.isFinite(requisitionId)) error(400, 'Invalid requisition id');

	const includeAllExperience = url.searchParams.get('includeAllExperience') === 'true';
	const includeOutsidePayRange = url.searchParams.get('includeOutsidePayRange') === 'true';

	const requisition = await getRequisitionDetailsById(requisitionId);
	if (!requisition?.requisition) error(404, 'Requisition not found');

	// Resolve the user's company the same way +page.server.ts does, and use it
	// for the company-scoped location lookup. This enforces tenant isolation
	// (location must belong to the user's company unless SUPERADMIN).
	let companyId: string;
	if (user.role === USER_ROLES.SUPERADMIN) {
		const client = await getClientProfileByIdAdmin(requisition.requisition.company.clientId);
		const company = await getClientCompanyByClientId(client.id);
		companyId = company.id;
	} else if (user.role === USER_ROLES.CLIENT) {
		const client = await getClientProfilebyUserId(user.id);
		const company = await getClientCompanyByClientId(client.id);
		companyId = company.id;
	} else if (user.role === USER_ROLES.CLIENT_STAFF) {
		const client = await getClientProfileByStaffUserId(user.id);
		const company = await getClientCompanyByClientId(client?.id);
		await assertCanAccessLocation(user, requisition.requisition.locationId);
		companyId = company.id;
	} else {
		error(403, 'Role not permitted');
	}

	const location = await getLocationByIdForCompany(requisition.requisition.locationId, companyId);
	if (!location) error(404, 'Location not found');

	const candidates = await getQualifiedProfessionalsForRequisition(
		requisition.requisition,
		location,
		{ includeAllExperience, includeOutsidePayRange }
	);

	return json(candidates);
};
