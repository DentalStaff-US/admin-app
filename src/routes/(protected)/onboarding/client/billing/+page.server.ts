import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getClientProfilebyUserId } from '$lib/server/database/queries/clients';
import db from '$lib/server/database/drizzle';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { USER_ROLES } from '$lib/config/constants';
import { hasBillingSetup } from '$lib/_helpers/billing';

// The onboarding billing page is now a thin shell: the UI calls
// /api/stripe/setup-customer-self directly to open Stripe in a new tab, and
// the "Need help?" button opens the shared SupportTicketDialog (which POSTs
// to /api/support/tickets). No page-level form actions are needed.

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) {
		redirect(302, '/auth/sign-in');
	}

	// Only the CLIENT account owner manages billing — staff are invited users
	// and shouldn't see this page.
	if (user.role !== USER_ROLES.CLIENT) {
		redirect(302, '/dashboard');
	}

	const client = await getClientProfilebyUserId(user.id);
	if (!client) {
		// They reached this page without finishing earlier onboarding steps.
		// Bounce them back to the start of the funnel.
		redirect(302, '/onboarding/client/company');
	}

	const [subscription] = await db
		.select()
		.from(clientSubscriptionTable)
		.where(eq(clientSubscriptionTable.clientId, client.id))
		.limit(1);

	// If they're already set up (e.g. came back to this page on purpose),
	// don't pretend it's an action item.
	if (hasBillingSetup(subscription ?? null)) {
		redirect(302, '/dashboard');
	}

	return {
		user,
		subscriptionPending: subscription?.stripeCustomerSetupPending ?? false
	};
};
