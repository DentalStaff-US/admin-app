/**
 * resolveDashboardScope (10 §4.2 rule 1): one scope object per request, required by
 * every new dashboard query. The tenancy decision itself stays in the existing
 * `getClientStaffScopedLocationIds` (scoping.ts); this wraps it with the company,
 * the location names, a label and the capability flags.
 *
 * Resolved in the dashboard loader rather than hooks/layout: those files belong to
 * the shell. Moving it to `locals.scope` is a one-line change once other pages use it.
 */
import { asc, eq } from 'drizzle-orm';
import type { AppUser } from '$lib/server/auth';
import db from '$lib/server/database/drizzle';
import { userTable } from '$lib/server/database/schemas/auth';
import {
	clientCompanyTable,
	clientProfileTable,
	clientStaffProfileTable,
	companyOfficeLocationTable
} from '$lib/server/database/schemas/client';
import { getClientStaffScopedLocationIds } from '$lib/server/scoping';
import { USER_ROLES } from '$lib/config/constants';
import { capabilitiesFor, narrowToLocation, scopeLabel, type StaffRole } from '../scope';
import type { DashboardScope } from '../types';

export type ScopedClient = {
	scope: DashboardScope;
	client: typeof clientProfileTable.$inferSelect;
};

export function adminScope(): DashboardScope {
	return {
		kind: 'all',
		clientId: null,
		companyId: null,
		locationIds: null,
		locations: [],
		availableLocations: [],
		chosen: false,
		label: 'All practices',
		can: capabilitiesFor(USER_ROLES.SUPERADMIN),
		ownerName: null,
		ownerEmail: null
	};
}

/**
 * Practice scope for CLIENT and CLIENT_STAFF. Returns null when the user has no
 * client profile (the loader redirects, as before).
 * `requestedLocation` is the owner's location filter; it can only narrow.
 */
export async function resolveClientScope(
	user: Pick<AppUser, 'id' | 'role' | 'firstName' | 'lastName' | 'email'>,
	requestedLocation?: string | null
): Promise<ScopedClient | null> {
	let client: typeof clientProfileTable.$inferSelect | undefined;
	let staffRole: StaffRole | null = null;

	if (user.role === USER_ROLES.CLIENT) {
		[client] = await db.select().from(clientProfileTable).where(eq(clientProfileTable.userId, user.id)).limit(1);
	} else if (user.role === USER_ROLES.CLIENT_STAFF) {
		const [staff] = await db
			.select({ clientId: clientStaffProfileTable.clientId, staffRole: clientStaffProfileTable.staffRole })
			.from(clientStaffProfileTable)
			.where(eq(clientStaffProfileTable.userId, user.id))
			.limit(1);
		if (staff) {
			staffRole = (staff.staffRole as StaffRole | null) ?? 'CLIENT_EMPLOYEE';
			[client] = await db.select().from(clientProfileTable).where(eq(clientProfileTable.id, staff.clientId)).limit(1);
		}
	} else {
		return null;
	}
	if (!client) return null;

	const [[company], [owner], scopedLocationIds] = await Promise.all([
		db
			.select({ id: clientCompanyTable.id })
			.from(clientCompanyTable)
			.where(eq(clientCompanyTable.clientId, client.id))
			.limit(1),
		db
			.select({ firstName: userTable.firstName, lastName: userTable.lastName, email: userTable.email })
			.from(userTable)
			.where(eq(userTable.id, client.userId))
			.limit(1),
		// The existing tenancy rule: null = company-wide, [] = nothing, [ids] = those.
		getClientStaffScopedLocationIds(user)
	]);

	const companyLocations = company
		? await db
				.select({ id: companyOfficeLocationTable.id, name: companyOfficeLocationTable.name })
				.from(companyOfficeLocationTable)
				.where(eq(companyOfficeLocationTable.companyId, company.id))
				.orderBy(asc(companyOfficeLocationTable.name))
		: [];

	const inScope =
		scopedLocationIds === null ? companyLocations : companyLocations.filter((l) => scopedLocationIds.includes(l.id));

	const kind: DashboardScope['kind'] = scopedLocationIds === null ? 'company' : 'locations';
	const scope: DashboardScope = {
		kind,
		clientId: client.id,
		companyId: company?.id ?? null,
		// Assignments are the authority; names are only for display.
		locationIds: scopedLocationIds,
		locations: inScope,
		availableLocations: inScope,
		chosen: false,
		label: scopeLabel(kind, inScope),
		can: capabilitiesFor(user.role, staffRole),
		ownerName: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') || null : null,
		ownerEmail: owner?.email ?? null
	};

	return { scope: narrowToLocation(scope, requestedLocation), client };
}
