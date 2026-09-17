/**
 * Account-status gates for the cross-app external API.
 *
 * Deliberately pure and dependency-free (no DB, no $env) so it is unit-testable
 * in isolation — `serverUtils.ts`, which owns the JWT and the DB read, imports
 * from here rather than inlining these decisions.
 */

export type AccountCheck = { ok: true } | { ok: false; status: 403; message: string };

/** Just the fields `checkAccountUsable` needs — not the whole user row. */
export type AccountStatusFields = {
	blacklisted: boolean | null;
	banned: boolean | null;
	banExpires: Date | null;
};

/**
 * Whether a token holder is still allowed to use the external API.
 *
 * External tokens live for an hour, so without this a user banned or
 * blacklisted through the admin plane kept full access to every
 * /api/external/* endpoint until their token happened to expire — meaning
 * `admin.banUser()` was silently ineffective against the entire cross-app API.
 *
 * A ban whose `banExpires` is in the past has lapsed and is not enforced; a ban
 * with no expiry is permanent. `now` is injectable so expiry is testable.
 */
export function checkAccountUsable(
	user: AccountStatusFields,
	now: Date = new Date()
): AccountCheck {
	if (user.blacklisted) {
		return { ok: false, status: 403, message: 'Account suspended' };
	}
	if (user.banned && (!user.banExpires || user.banExpires > now)) {
		return { ok: false, status: 403, message: 'Account suspended' };
	}
	return { ok: true };
}

/**
 * Optional role gate. `allowed` undefined or empty means "any role" — which is
 * what every pre-existing call site gets, so none of them change behaviour.
 */
export function checkRoleAllowed(
	role: string | null | undefined,
	allowed?: readonly string[]
): AccountCheck {
	if (!allowed || allowed.length === 0) return { ok: true };
	if (role && allowed.includes(role)) return { ok: true };
	return { ok: false, status: 403, message: 'Insufficient permissions' };
}
