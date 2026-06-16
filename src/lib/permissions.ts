// Better Auth access-control definitions for the platform BASE roles.
//
// Scope note: this governs only the four base roles (SUPERADMIN / CLIENT /
// CLIENT_STAFF / CANDIDATE). CLIENT_STAFF sub-roles (CLIENT_ADMIN / MANAGER /
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
export const CLIENT = ac.newRole({});
export const CLIENT_STAFF = ac.newRole({});
export const CANDIDATE = ac.newRole({});

export const roles = {
	SUPERADMIN,
	CLIENT,
	CLIENT_STAFF,
	CANDIDATE
};
