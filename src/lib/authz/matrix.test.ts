import { describe, expect, it } from 'vitest';
import { roles } from '$lib/permissions';
import { adminMenuFor } from '$lib/features/admin/menu';
import { ADMIN_MENU_ITEMS } from '$lib/features/admin/adminMenuItems';
import { capabilitiesFor } from '$lib/features/dashboard/scope';
import { settingsViewFor } from '$lib/features/settings/settingsNav';
import { ALL_PERMISSIONS, can, GRANTS, permissionsFor, type Permission } from './matrix';

/**
 * API plan 02 §6.3, one row per line: [area, permissions, ADMIN holds them].
 * SUPERADMIN holds everything. The "proposed" rows are decided: invoices
 * create + reminders → ADMIN yes; audit log → ADMIN may read.
 */
const ROWS: [string, Permission[], boolean][] = [
	['Requisitions, shifts, recommendations, comments', ['requisitions.manage'], true],
	['Timesheets: review, approve, adjust', ['timesheets.approve'], true],
	['Professionals: review, approve, documents', ['professionals.manage'], true],
	['Practices and locations: view, edit', ['practices.manage'], true],
	['Compliance queue, snoozes', ['compliance.manage'], true],
	['Inbox, support tickets', ['inbox.manage', 'support.manage'], true],
	['Dashboards, operational reports', ['dashboard.read', 'reports.read'], true],
	['Blacklist: add', ['blacklist.add'], true],
	['Invoices, transactions: view', ['invoices.read'], true],
	['Invoices: create, send reminders', ['invoices.create', 'invoices.remind'], true],
	['Invoices: void, one-off, mark paper paid, refunds', ['invoices.void', 'invoices.oneOff', 'payments.record'], false],
	['Partner payouts, wages marked paid', ['payouts.manage', 'wages.markPaid'], false],
	['Blacklist: remove', ['blacklist.remove'], false],
	['Ban or delete users, revoke sessions', ['users.ban', 'users.delete', 'sessions.revoke'], false],
	['Impersonate', ['users.impersonate'], false],
	['Manage admins and roles', ['admins.manage'], false],
	['Audit log (record-history)', ['audit.read'], true],
	['Bulk PII exports, user import', ['exports.run', 'users.import'], false],
	['Mass notifications, SMS and email tools', ['comms.massSend'], false],
	['Reference data and app settings', ['platform.configure'], false],
	// Not a §6.3 row: the screens behind "view" rows above.
	['All users list, affiliate program: view', ['users.read', 'affiliates.read'], true]
];

describe('role matrix §6.3', () => {
	it.each(ROWS)('%s', (_area, permissions, adminHolds) => {
		for (const p of permissions) {
			expect(can('SUPERADMIN', p), `SUPERADMIN ${p}`).toBe(true);
			expect(can('ADMIN', p), `ADMIN ${p}`).toBe(adminHolds);
		}
	});

	it('every permission is covered by a row, so nothing is granted by accident', () => {
		const covered = new Set(ROWS.flatMap(([, ps]) => ps));
		expect([...ALL_PERMISSIONS].filter((p) => !covered.has(p))).toEqual([]);
	});

	it('SUPERADMIN holds every permission; ADMIN a strict subset', () => {
		expect(permissionsFor('SUPERADMIN')).toEqual([...ALL_PERMISSIONS]);
		expect(GRANTS.ADMIN.length).toBeLessThan(ALL_PERMISSIONS.length);
		for (const p of GRANTS.ADMIN) expect(can('SUPERADMIN', p)).toBe(true);
	});

	it.each(['CLIENT', 'CLIENT_STAFF', 'CANDIDATE', 'EXTERNAL_PARTNER', 'CLIENT_ADMIN', 'admin', '', 'superadmin'])(
		'%s gets no admin permissions (deny by default)',
		(role) => {
			for (const p of ALL_PERMISSIONS) expect(can(role, p)).toBe(false);
			expect(permissionsFor(role)).toEqual([]);
		}
	);

	it('accepts a user object, and refuses a missing user', () => {
		expect(can({ role: 'ADMIN' }, 'timesheets.approve')).toBe(true);
		expect(can({ role: 'ADMIN' }, 'invoices.void')).toBe(false);
		expect(can(null, 'invoices.read')).toBe(false);
		expect(can(undefined, 'invoices.read')).toBe(false);
		expect(can({ role: null }, 'invoices.read')).toBe(false);
	});
});

describe('Better Auth admin-plugin roles', () => {
	it('ADMIN can look users up but not ban, impersonate, delete or set roles', () => {
		expect(roles.ADMIN.authorize({ user: ['list', 'get'] }).success).toBe(true);
		for (const action of ['ban', 'impersonate', 'delete', 'set-role', 'set-password', 'create'] as const) {
			expect(roles.ADMIN.authorize({ user: [action] }).success, action).toBe(false);
		}
		expect(roles.ADMIN.authorize({ session: ['revoke'] }).success).toBe(false);
	});

	it('SUPERADMIN keeps the full admin statement set', () => {
		expect(roles.SUPERADMIN.authorize({ user: ['ban', 'impersonate', 'set-role'] }).success).toBe(true);
	});
});

describe('surfaces that read the matrix', () => {
	it('every admin menu tool names a permission, and ADMIN sees only what it holds', () => {
		for (const item of ADMIN_MENU_ITEMS) expect(item.permission, item.href).toBeTruthy();
		const forAdmin = adminMenuFor(ADMIN_MENU_ITEMS, { role: 'ADMIN' }).map((i) => i.href);
		expect(forAdmin).toEqual(expect.arrayContaining(['/requisitions', '/timesheets', '/admin/compliance', '/admin/menu/record-history']));
		for (const hidden of ['/admin/menu/admins', '/admin/menu/exports', '/admin/menu/user-import', '/admin/menu/mass-notifications', '/admin/menu/application-settings', '/admin/menu/skills']) {
			expect(forAdmin).not.toContain(hidden);
		}
		expect(adminMenuFor(ADMIN_MENU_ITEMS, { role: 'SUPERADMIN' })).toHaveLength(ADMIN_MENU_ITEMS.length);
		expect(adminMenuFor(ADMIN_MENU_ITEMS, { role: 'CLIENT' })).toEqual([]);
	});

	it('an ADMIN gets the admin settings screen, like a SUPERADMIN', () => {
		expect(settingsViewFor('ADMIN', false)).toBe('admin');
		expect(settingsViewFor('SUPERADMIN', false)).toBe('admin');
	});

	it('dashboard capabilities for staff come from the matrix', () => {
		expect(capabilitiesFor('ADMIN')).toEqual({ approveTimesheets: true, postRequests: true, viewBilling: true, manageStaff: true });
		expect(capabilitiesFor('SUPERADMIN')).toEqual({ approveTimesheets: true, postRequests: true, viewBilling: true, manageStaff: true });
	});
});
