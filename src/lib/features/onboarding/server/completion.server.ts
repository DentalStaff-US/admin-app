import { eq } from 'drizzle-orm';
import { hasBillingSetup } from '$lib/_helpers/billing';
import db from '$lib/server/database/drizzle';
import { getClientCompanyByClientId, getClientProfilebyUserId } from '$lib/server/database/queries/clients';
import { clientSubscriptionTable } from '$lib/server/database/schemas/client';

/**
 * What the onboarding completion screen shows: the practice name and whether
 * billing is set up. Null when the user hasn't created a practice yet.
 * Read-only.
 */
export async function getOnboardingSummary(userId: string) {
	const client = await getClientProfilebyUserId(userId);
	if (!client) return null;

	const company = await getClientCompanyByClientId(client.id);
	const [subscription] = await db
		.select()
		.from(clientSubscriptionTable)
		.where(eq(clientSubscriptionTable.clientId, client.id))
		.limit(1);

	return {
		companyName: (company?.companyName as string | undefined) ?? null,
		billingSetUp: hasBillingSetup(subscription ?? null)
	};
}
