// Location-based scoping for CLIENT_STAFF users.
//
// The product rule:
//   - SUPERADMIN, CLIENT (account owner): see EVERYTHING (no scoping).
//   - CLIENT_STAFF with staffRole === 'CLIENT_ADMIN': see everything for
//     their company (treated like the account owner — no scoping).
//   - CLIENT_STAFF with staffRole CLIENT_MANAGER or CLIENT_EMPLOYEE: scoped
//     to the locations they're assigned to.
//   - CANDIDATEs aren't allowed past the admin app at all (hooks.server.ts).
//
// `getClientStaffScopedLocationIds` returns:
//   - `null` for unscoped users (CLIENT, SUPERADMIN, CLIENT_ADMIN staff,
//     anyone else) — caller treats as "no filter"
//   - `string[]` (possibly empty) for scoped CLIENT_STAFF — empty array
//     means "this staff has no location assignments yet, show them nothing"
//
// Callers should pass this through to query helpers that accept an optional
// `locationIds` filter. The convention is:
//   - `undefined / null` → no scoping applied
//   - `[]`               → restrict to nothing (empty result)
//   - `[id, ...]`        → restrict to set
//
// `assertCanAccessLocation` is the per-resource access guard for routes that
// load by id (e.g. /locations/[id], /requisitions/[id]). Unscoped users
// pass through. Scoped staff must have the location in their set or we
// throw a 403.

import type { AppUser as User } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import db from './database/drizzle';
import { USER_ROLES } from '$lib/config/constants';
import { clientStaffLocationTable, clientStaffProfileTable } from './database/schemas/client';

export async function getClientStaffScopedLocationIds(
	user: Pick<User, 'id' | 'role'> | null | undefined
): Promise<string[] | null> {
	if (!user) return null;
	if (user.role !== USER_ROLES.CLIENT_STAFF) return null;

	// CLIENT_ADMIN staff are treated as company-wide admins — same view as
	// the CLIENT account owner. Only CLIENT_MANAGER and CLIENT_EMPLOYEE get
	// the per-location filter.
	const [staff] = await db
		.select({
			id: clientStaffProfileTable.id,
			staffRole: clientStaffProfileTable.staffRole
		})
		.from(clientStaffProfileTable)
		.where(eq(clientStaffProfileTable.userId, user.id))
		.limit(1);

	if (!staff) return []; // No staff profile = no assignments = no data.
	if (staff.staffRole === 'CLIENT_ADMIN') return null;

	const rows = await db
		.select({ locationId: clientStaffLocationTable.locationId })
		.from(clientStaffLocationTable)
		.where(eq(clientStaffLocationTable.staffId, staff.id));

	return rows.map((r) => r.locationId);
}

export async function assertCanAccessLocation(
	user: Pick<User, 'id' | 'role'> | null | undefined,
	locationId: string | null | undefined
): Promise<void> {
	if (!user) throw error(401, 'Unauthorized');
	if (user.role !== USER_ROLES.CLIENT_STAFF) return;
	if (!locationId) throw error(403, 'Not allowed');

	const scope = await getClientStaffScopedLocationIds(user);
	// `null` scope means "unscoped" (e.g. CLIENT_ADMIN) — pass through.
	if (scope === null) return;
	if (!scope.includes(locationId)) {
		throw error(403, 'Not allowed');
	}
}
