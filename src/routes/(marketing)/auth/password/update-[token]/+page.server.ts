import { redirect } from '@sveltejs/kit';

// Legacy Lucia-era reset route. Better Auth now delivers reset links to
// /auth/password/update?token=... (passwords live in the account table, not
// users.password), so this path-token variant is retired. Any stale link is
// redirected to request a fresh reset.
export const load = async () => {
	redirect(302, '/auth/password/reset');
};
