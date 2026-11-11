// Better Auth access-control definitions for the platform BASE roles.
//
// Scope note: this governs only the base roles (SUPERADMIN / ADMIN / CLIENT /
// CLIENT_STAFF / CANDIDATE / EXTERNAL_PARTNER). App-level staff permissions
// (void an invoice, mass send, …) live in the role matrix at $lib/authz; this
// file only decides which Better Auth admin-plugin endpoints a role may call. CLIENT_STAFF sub-roles (CLIENT_ADMIN / MANAGER /
// EMPLOYEE) and per-location scoping continue to live in the app layer
// (clientStaffProfileTable + src/lib/server/scoping.ts) and are intentionally
// NOT modelled here — see the migration plan ("Role-based scoping — deferred").
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc } from 'better-auth/plugins/admin/access';

// Start from Better Auth's default admin statements (user + session resources).
// Additional app resources can be added here later without breaking existing roles.
export const statement = {
	...defaultStatements
} as const;

export const ac = createAccessControl(statement);

// SUPERADMIN gets the full admin statement set (manage users, ban, impersonate,
// revoke sessions, etc.). The other base roles hold no admin-plane permissions —
// their authorization is enforced by route gating + app-layer scoping.
export const SUPERADMIN = ac.newRole({ ...adminAc.statements });
// ADMIN (DTSS operations staff) may look users and sessions up, but can't ban,
// impersonate, delete, set roles, passwords or emails, or revoke sessions
// (AZ-3/AZ-4). It is deliberately NOT in `adminRoles` in auth.ts.
export const ADMIN = ac.newRole({ user: ['list', 'get'], session: ['list'] });
export const CLIENT = ac.newRole({});
export const CLIENT_STAFF = ac.newRole({});
export const CANDIDATE = ac.newRole({});
// External affiliates (schools, suppliers, consultants, influencers). Like the
// other non-admin roles it holds no admin-plane permissions — its authorization
// is route gating plus affiliate-profile eligibility. Registered here so the
// roles map is exhaustive.
export const EXTERNAL_PARTNER = ac.newRole({});

export const roles = {
	SUPERADMIN,
	ADMIN,
	CLIENT,
	CLIENT_STAFF,
	CANDIDATE,
	EXTERNAL_PARTNER
};
