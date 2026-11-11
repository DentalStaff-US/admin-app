import { describe, expect, it } from 'vitest';
import { guardAccountAction, guardStaffChange, guardStaffInvite } from './guards';

const SUPER = { id: 's1', role: 'SUPERADMIN' };
const SUPER2 = { id: 's2', role: 'SUPERADMIN' };
const ADMIN = { id: 'a1', role: 'ADMIN' };
const ADMIN2 = { id: 'a2', role: 'ADMIN' };
const CLIENT = { id: 'c1', role: 'CLIENT' };

describe('guardStaffInvite (AZ-4)', () => {
	it('a SUPERADMIN may invite an Admin or a Super admin', () => {
		expect(guardStaffInvite(SUPER, 'ADMIN')).toEqual({ ok: true });
		expect(guardStaffInvite(SUPER, 'SUPERADMIN')).toEqual({ ok: true });
	});

	it('an ADMIN may not invite anyone, at any role', () => {
		expect(guardStaffInvite(ADMIN, 'ADMIN')).toMatchObject({ ok: false, status: 403 });
		expect(guardStaffInvite(ADMIN, 'SUPERADMIN')).toMatchObject({ ok: false, status: 403 });
		expect(guardStaffInvite(CLIENT, 'ADMIN')).toMatchObject({ ok: false, status: 403 });
	});

	it('only staff roles can be invited from the team screen', () => {
		expect(guardStaffInvite(SUPER, 'CLIENT')).toMatchObject({ ok: false, status: 400 });
		expect(guardStaffInvite(SUPER, 'CANDIDATE')).toMatchObject({ ok: false, status: 400 });
	});
});

describe('guardStaffChange (AZ-4)', () => {
	it('an ADMIN cannot edit, demote or remove a SUPERADMIN', () => {
		for (const change of [{ kind: 'edit' }, { kind: 'remove' }, { kind: 'setRole', role: 'ADMIN' }] as const) {
			expect(guardStaffChange(ADMIN, SUPER, change, 2)).toMatchObject({ ok: false, status: 403 });
		}
	});

	it('an ADMIN cannot assign roles, even to another ADMIN or themselves', () => {
		expect(guardStaffChange(ADMIN, ADMIN2, { kind: 'setRole', role: 'SUPERADMIN' }, 1)).toMatchObject({ ok: false, status: 403 });
		expect(guardStaffChange(ADMIN, ADMIN, { kind: 'setRole', role: 'SUPERADMIN' }, 1)).toMatchObject({ ok: false, status: 403 });
		expect(guardStaffChange(ADMIN, ADMIN2, { kind: 'remove' }, 1)).toMatchObject({ ok: false, status: 403 });
	});

	it('a SUPERADMIN can promote, demote, edit and remove another staff member', () => {
		expect(guardStaffChange(SUPER, ADMIN, { kind: 'setRole', role: 'SUPERADMIN' }, 1)).toEqual({ ok: true });
		expect(guardStaffChange(SUPER, SUPER2, { kind: 'setRole', role: 'ADMIN' }, 2)).toEqual({ ok: true });
		expect(guardStaffChange(SUPER, SUPER2, { kind: 'edit' }, 2)).toEqual({ ok: true });
		expect(guardStaffChange(SUPER, SUPER2, { kind: 'remove' }, 2)).toEqual({ ok: true });
		expect(guardStaffChange(SUPER, ADMIN, { kind: 'remove' }, 1)).toEqual({ ok: true });
	});

	it('the last SUPERADMIN cannot be removed or demoted', () => {
		expect(guardStaffChange(SUPER, SUPER2, { kind: 'remove' }, 1)).toMatchObject({ ok: false, status: 400 });
		expect(guardStaffChange(SUPER, SUPER2, { kind: 'setRole', role: 'ADMIN' }, 1)).toMatchObject({ ok: false, status: 400 });
		// Editing their details is still fine.
		expect(guardStaffChange(SUPER, SUPER2, { kind: 'edit' }, 1)).toEqual({ ok: true });
	});

	it('nobody removes themselves or changes their own role', () => {
		expect(guardStaffChange(SUPER, SUPER, { kind: 'remove' }, 3)).toMatchObject({ ok: false, status: 400 });
		expect(guardStaffChange(SUPER, SUPER, { kind: 'setRole', role: 'ADMIN' }, 3)).toMatchObject({ ok: false, status: 400 });
		expect(guardStaffChange(SUPER, SUPER, { kind: 'edit' }, 1)).toEqual({ ok: true });
	});

	it('a role can only be set to Admin or Super admin', () => {
		expect(guardStaffChange(SUPER, ADMIN, { kind: 'setRole', role: 'CLIENT' }, 2)).toMatchObject({ ok: false, status: 400 });
		expect(guardStaffChange(SUPER, ADMIN, { kind: 'setRole', role: null }, 2)).toMatchObject({ ok: false, status: 400 });
	});

	it('setting the same role again is a no-op, not a refusal', () => {
		expect(guardStaffChange(SUPER, ADMIN, { kind: 'setRole', role: 'ADMIN' }, 1)).toEqual({ ok: true });
	});
});

describe('guardAccountAction (All users screen)', () => {
	it('needs the permission: an ADMIN cannot suspend or delete anyone', () => {
		expect(guardAccountAction(ADMIN, CLIENT, 'users.ban', 1)).toMatchObject({ ok: false, status: 403 });
		expect(guardAccountAction(ADMIN, CLIENT, 'users.delete', 1)).toMatchObject({ ok: false, status: 403 });
	});

	it('a SUPERADMIN may act on practices and professionals', () => {
		expect(guardAccountAction(SUPER, CLIENT, 'users.ban', 1)).toEqual({ ok: true });
		expect(guardAccountAction(SUPER, { id: 'p1', role: 'CANDIDATE' }, 'users.delete', 1)).toEqual({ ok: true });
	});

	it('staff targets go through the staff guards, including the last SUPERADMIN', () => {
		expect(guardAccountAction(SUPER, SUPER2, 'users.ban', 1)).toMatchObject({ ok: false, status: 400 });
		expect(guardAccountAction(SUPER, SUPER2, 'users.delete', 2)).toEqual({ ok: true });
		expect(guardAccountAction(SUPER, ADMIN, 'users.ban', 1)).toEqual({ ok: true });
	});

	it('never yourself', () => {
		expect(guardAccountAction(SUPER, SUPER, 'users.ban', 5)).toMatchObject({ ok: false, status: 400 });
	});
});
