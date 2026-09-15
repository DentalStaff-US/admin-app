/**
 * Shared access resolution for requisition-scoped API endpoints.
 *
 * Extracted from `/api/requisitions/[id]/qualified-candidates` so the several
 * endpoints that expose candidate data for a requisition cannot drift apart on
 * the part that actually enforces tenant isolation: the location must be looked
 * up THROUGH the caller's own company, so a CLIENT can never reach another
 * company's requisition by guessing an id.
 */

import { error } from '@sveltejs/kit';
import { USER_ROLES } from '$lib/config/constants';
import {
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId,
	getLocationByIdForCompany
} from '$lib/server/database/queries/clients';
import { getRequisitionDetailsById } from '$lib/server/database/queries/requisitions';
import { getClientProfileByIdAdmin } from '$lib/server/database/queries/admin';
import { assertCanAccessLocation } from '$lib/server/scoping';

type SessionUser = { id: string; role: string };

/**
 * Resolves the requisition, the caller's company, and the requisition's
 * location — throwing the appropriate HTTP error if the caller may not see it.
 *
 * Throws 401 unauthenticated, 403 for roles with no company, 404 when the
 * requisition doesn't exist or its location isn't reachable from the caller's
 * company.
 */
export async function resolveRequisitionAccess(
	user: SessionUser | null | undefined,
	requisitionId: number
) {
	if (!user) error(401, 'Not authenticated');
	if (!Number.isFinite(requisitionId)) error(400, 'Invalid requisition id');

	const requisition = await getRequisitionDetailsById(requisitionId);
	if (!requisition?.requisition) error(404, 'Requisition not found');

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
		// Scoped staff can only reach their assigned locations.
		await assertCanAccessLocation(user, requisition.requisition.locationId);
		companyId = company.id;
	} else {
		error(403, 'Role not permitted');
	}

	// Company-scoped lookup: this is the isolation boundary, not a convenience.
	const location = await getLocationByIdForCompany(requisition.requisition.locationId, companyId);
	if (!location) error(404, 'Location not found');

	return { requisition: requisition.requisition, location, companyId };
}
