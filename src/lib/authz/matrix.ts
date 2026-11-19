/**
 * The admin role matrix (API plan 02 §6.3, AZ-2/AZ-3/AZ-11): named permissions,
 * the grants each staff role holds, and `can()`. Routes and components check a
 * permission, never a role name, so a narrower admin role later is one entry in
 * GRANTS rather than a sweep through route code.
 *
 * Framework-free on purpose: it runs in loaders, actions, components and tests.
 *
 * Scope: DTSS staff only (SUPERADMIN and ADMIN). Practice sub-roles
 * (CLIENT_ADMIN / MANAGER / EMPLOYEE) keep their existing checks for now (AZ-7
 * moves them here in a later milestone). Every other role gets no admin
 * permissions.
 *
 * The principle: ADMIN runs daily operations, but can't move money
 * irreversibly, change who has power, or change the platform.
 */

/** Daily operations: ADMIN and SUPERADMIN. */
export const ADMIN_OPERATIONS = [
	/** The admin dashboard, its KPIs and operational reports. */
	'dashboard.read',
	'reports.read',
	/** Requisitions, shifts, recommendations, internal comments. */
	'requisitions.manage',
	/** Timesheets: review, approve, reject, adjust hours, rates and expenses. */
	'timesheets.approve',
	/** Professionals: review, approve, documents, skills, availability. */
	'professionals.manage',
	/** Practices and their locations, staff invites, documents and signatures. */
	'practices.manage',
	/** The credential compliance queue: reminders and snoozes. */
	'compliance.manage',
	/** Inbox and support tickets. */
	'inbox.manage',
	'support.manage',
	/** Block a professional from a practice. */
	'blacklist.add',
	/** Invoices and transactions: view. */
	'invoices.read',
	/** Raise a requisition's invoice; invoice reminders. */
	'invoices.create',
	'invoices.remind',
	/** Record history (the action_history ledger): read. */
	'audit.read',
	/** The All users list: search and look, without the account actions. */
	'users.read',
	/** The affiliate program: view partners, referrals and payouts. */
	'affiliates.read'
] as const;

/** SUPERADMIN only: money, power and the platform itself. */
export const SUPERADMIN_ONLY = [
	/** Void an invoice (or a timesheet with its invoice). */
	'invoices.void',
	/** A custom one-off invoice raised from a practice's page. */
	'invoices.oneOff',
	/** Charge a Stripe invoice now, record or reverse a paper payment, refunds. */
	'payments.record',
	/** Mark a professional's wages paid (or due again). */
	'wages.markPaid',
	/** Affiliate commission, rate overrides, ledger adjustments, flagged referrals. */
	'payouts.manage',
	'blacklist.remove',
	/** Suspend/reinstate, delete or anonymize accounts, revoke sessions. */
	'users.ban',
	'users.delete',
	'sessions.revoke',
	/** Switch a practice owner to a professional or back (deletes the old profile). */
	'users.changeRole',
	'users.impersonate',
	/** Invite, edit, change the role of, or remove DTSS admins. */
	'admins.manage',
	/** Bulk PII exports and CSV user import. */
	'exports.run',
	'users.import',
	/** Mass notifications, SMS and email tools. */
	'comms.massSend',
	/** Reference data and app settings: skills, disciplines, experience levels, fees. */
	'platform.configure'
] as const;

export const ALL_PERMISSIONS = [...ADMIN_OPERATIONS, ...SUPERADMIN_ONLY] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** The staff roles the matrix grants to. Values match users.role. */
export const STAFF_ROLES = ['SUPERADMIN', 'ADMIN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const GRANTS: Record<StaffRole, readonly Permission[]> = {
	SUPERADMIN: ALL_PERMISSIONS,
	ADMIN: ADMIN_OPERATIONS
};

const GRANT_SETS: Record<StaffRole, ReadonlySet<Permission>> = {
	SUPERADMIN: new Set(GRANTS.SUPERADMIN),
	ADMIN: new Set(GRANTS.ADMIN)
};

type RoleLike = string | null | undefined | { role?: string | null } | null;

function roleOf(userOrRole: RoleLike): string | null {
	if (!userOrRole) return null;
	if (typeof userOrRole === 'string') return userOrRole;
	return userOrRole.role ?? null;
}

export function isStaffRole(role: string | null | undefined): role is StaffRole {
	return role === 'SUPERADMIN' || role === 'ADMIN';
}

/**
 * Does this user (or role) hold `permission`? Deny by default: unknown roles,
 * practice and professional roles, and missing users all get false.
 */
export function can(userOrRole: RoleLike, permission: Permission): boolean {
	const role = roleOf(userOrRole);
	if (!isStaffRole(role)) return false;
	return GRANT_SETS[role].has(permission);
}

/** Every permission the role holds, in matrix order. Empty for non-staff roles. */
export function permissionsFor(userOrRole: RoleLike): Permission[] {
	const role = roleOf(userOrRole);
	return isStaffRole(role) ? [...GRANTS[role]] : [];
}

/** Display label and one plain sentence for each staff role, for invite and edit screens. */
export const STAFF_ROLE_OPTIONS: { value: StaffRole; label: string; description: string }[] = [
	{
		value: 'ADMIN',
		label: 'Admin',
		description:
			'Runs daily operations: requisitions, timesheets, professionals, practices and invoices, but can’t void invoices, record payments, suspend accounts or change platform settings.'
	},
	{
		value: 'SUPERADMIN',
		label: 'Super admin',
		description: 'Everything an admin can do, plus money, account suspensions, platform settings and managing other admins.'
	}
];

export function staffRoleLabel(role: string | null | undefined): string {
	return STAFF_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role ?? '—';
}
