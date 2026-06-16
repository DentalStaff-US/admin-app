// Browser-side Better Auth client for the admin/client portal.
import { createAuthClient } from 'better-auth/svelte';
import { adminClient, twoFactorClient } from 'better-auth/client/plugins';
import { ac, roles } from '$lib/permissions';

export const authClient = createAuthClient({
	plugins: [
		adminClient({ ac, roles }),
		twoFactorClient({
			onTwoFactorRedirect() {
				// Redirect to the 2FA challenge page when a sign-in requires a second factor.
				window.location.href = '/auth/two-factor';
			}
		})
	]
});

export const { signIn, signUp, signOut, useSession } = authClient;
