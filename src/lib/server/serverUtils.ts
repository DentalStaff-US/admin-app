import { error } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import { userTable } from '$lib/server/database/schemas/auth';
import { JWT_SECRET } from '$env/static/private';
import { checkAccountUsable, checkRoleAllowed } from '$lib/server/accountStatus';

interface JwtPayload {
	userId: string;
	// Add any other claims you include in your JWT
}

export function generateToken(userId: string): string {
	return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

export type AuthenticateOptions = {
	/** Restrict to these `users.role` values. Omit to allow any role. */
	roles?: readonly string[];
};

export async function authenticateUser(event: Request, opts?: AuthenticateOptions) {
	const authHeader = event.headers.get('Authorization');

	if (!authHeader) {
		throw error(401, 'No authorization header');
	}

	const token = authHeader.split(' ')[1];

	if (!token) {
		throw error(401, 'No token provided');
	}

	let decoded: JwtPayload;
	try {
		// TokenExpiredError extends JsonWebTokenError, so this covers expiry too.
		decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
	} catch (err) {
		if (err instanceof jwt.JsonWebTokenError) {
			throw error(401, 'Invalid token: ' + err);
		}
		throw error(500, 'Authentication error');
	}

	// NB: everything below is deliberately OUTSIDE the try/catch above. `error()`
	// throws an HttpError, which is not a JsonWebTokenError — so while these lived
	// inside the catch, a legitimate 401 ("User not found") was swallowed and
	// re-thrown as a 500.
	const rows = await db.select().from(userTable).where(eq(userTable.id, decoded.userId)).limit(1);

	if (rows.length === 0) {
		throw error(401, 'User not found');
	}

	const user = rows[0];

	// Banned/blacklisted users must not keep access for the remaining life of an
	// already-issued token.
	const usable = checkAccountUsable(user);
	if (!usable.ok) throw error(usable.status, usable.message);

	const roleOk = checkRoleAllowed(user.role, opts?.roles);
	if (!roleOk.ok) throw error(roleOk.status, roleOk.message);

	return user;
}
