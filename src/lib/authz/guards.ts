/**
 * Privilege guards (AZ-4). Pure: the caller loads the actor, the target and the
 * SUPERADMIN head count, and these decide.
 *
 *  - An ADMIN can't create, edit, demote, suspend or delete a SUPERADMIN.
 *  - An ADMIN can't assign roles or invite admins (they lack admins.manage).
 *  - The last SUPERADMIN can't be removed, suspended or demoted.
 *  - Nobody changes their own role (another super admin must do it).
 */
import { can, isStaffRole, type StaffRole } from './matrix';

export type GuardResult = { ok: true } | { ok: false; status: 400 | 403; message: string };

type Actor = { id: string; role: string | null | undefined };
type Target = { id: string; role: string | null | undefined };

const OK: GuardResult = { ok: true };
const refuse = (status: 400 | 403, message: string): GuardResult => ({ ok: false, status, message });

/** May `actor` invite (or create) a team member with `role`? */
export function guardStaffInvite(actor: Actor, role: string | null | undefined): GuardResult {
	if (!can(actor, 'admins.manage')) return refuse(403, 'Only a super admin can invite team members.');
	if (!isStaffRole(role)) return refuse(400, 'Choose Admin or Super admin.');
	return OK;
}

export type StaffChange =
	| { kind: 'edit' }
	| { kind: 'remove' }
	| { kind: 'setRole'; role: string | null | undefined };

/**
 * May `actor` make `change` to the staff account `target`?
 * `superadminCount` is how many SUPERADMIN accounts exist now (including target).
 */
export function guardStaffChange(
	actor: Actor,
	target: Target,
	change: StaffChange,
	superadminCount: number
): GuardResult {
	if (!can(actor, 'admins.manage')) {
		return refuse(403, target.role === 'SUPERADMIN' ? 'Only a super admin can change a super admin.' : 'Only a super admin can manage admins.');
	}

	const isSelf = actor.id === target.id;
	const targetIsSuper = target.role === 'SUPERADMIN';

	if (change.kind === 'edit') return OK;

	if (change.kind === 'remove') {
		if (isSelf) return refuse(400, 'You can’t remove your own account.');
		if (targetIsSuper && superadminCount <= 1) return refuse(400, 'This is the last super admin, so they can’t be removed.');
		return OK;
	}

	// setRole
	if (!isStaffRole(change.role)) return refuse(400, 'Choose Admin or Super admin.');
	if (change.role === target.role) return OK;
	if (isSelf) return refuse(400, 'You can’t change your own role. Ask another super admin.');
	if (targetIsSuper && (change.role as StaffRole) !== 'SUPERADMIN' && superadminCount <= 1) {
		return refuse(400, 'This is the last super admin, so they can’t be made an admin.');
	}
	return OK;
}

/**
 * Account actions on ANY user (suspend, delete, anonymize, switch role, sign
 * out) from the All users screens.
 * Non-staff targets need only the permission; staff targets also go through
 * guardStaffChange, so an ADMIN can never touch a SUPERADMIN.
 */
export function guardAccountAction(
	actor: Actor,
	target: Target,
	permission: 'users.ban' | 'users.delete' | 'users.changeRole' | 'sessions.revoke',
	superadminCount: number
): GuardResult {
	if (!can(actor, permission)) return refuse(403, 'You don’t have permission to do that.');
	if (actor.id === target.id) return refuse(400, 'You can’t do that to your own account.');
	if (isStaffRole(target.role)) return guardStaffChange(actor, target, { kind: 'remove' }, superadminCount);
	return OK;
}
