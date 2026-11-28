/**
 * Ownership for the practice-facing location actions (/locations, /locations/[id]).
 * Several actions trusted the location id in the URL, or the company, staff
 * and location ids in the form, so a practice user could edit another
 * practice's location or attach staff to it. This mirrors the page load:
 * the location must belong to the user's practice, and staff must also be
 * scoped to it. Not yours answers 404.
 */
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import { USER_ROLES } from '$lib/config/constants';
import db from '$lib/server/database/drizzle';
import {
	getClientCompanyByClientId,
	getClientProfileByStaffUserId,
	getClientProfilebyUserId
} from '$lib/server/database/queries/clients';
import {
	clientStaffProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { assertCanAccessLocation } from '$lib/server/scoping';

type Actor = { id: string; role: string };

/** The signed-in practice user's company id, or null for anyone else. */
export async function practiceCompanyId(user: Actor): Promise<string | null> {
	const client =
		user.role === USER_ROLES.CLIENT
			? await getClientProfilebyUserId(user.id)
			: user.role === USER_ROLES.CLIENT_STAFF
				? await getClientProfileByStaffUserId(user.id)
				: null;
	if (!client?.id) return null;
	const company = await getClientCompanyByClientId(client.id);
	return (company as { id?: string } | null)?.id ?? null;
}

/** The location's company, after checking the user may act on it. */
export async function assertLocationAccess(
	user: Actor,
	locationId: string
): Promise<{ companyId: string }> {
	const [location] = await db
		.select({ companyId: companyOfficeLocationTable.companyId })
		.from(companyOfficeLocationTable)
		.where(eq(companyOfficeLocationTable.id, locationId))
		.limit(1);
	if (!location) throw error(404, 'Location not found');
	if (checkIsAdmin(user.role)) return location;

	const companyId = await practiceCompanyId(user);
	if (!companyId || companyId !== location.companyId) throw error(404, 'Location not found');
	await assertCanAccessLocation(user, locationId);
	return location;
}

/** A staff profile id from a form must belong to the same company. */
export async function assertStaffInCompany(staffId: string, companyId: string): Promise<void> {
	const [staff] = await db
		.select({ id: clientStaffProfileTable.id })
		.from(clientStaffProfileTable)
		.where(
			and(eq(clientStaffProfileTable.id, staffId), eq(clientStaffProfileTable.companyId, companyId))
		)
		.limit(1);
	if (!staff) throw error(404, 'Staff member not found');
}
