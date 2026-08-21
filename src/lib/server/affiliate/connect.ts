/**
 * Stripe Connect (Express) for affiliate payouts.
 *
 * Express gives us Stripe-hosted KYC/identity verification and Stripe issues the
 * affiliate's 1099 — which is why 1099 generation is not on our roadmap at all.
 *
 * NOTE: `affiliate_profiles.stripe_connect_account_id` holds an `acct_…` id and
 * is completely unrelated to `users.stripe_customer_id` /
 * `client_subscriptions.stripe_customer_id`, which are `cus_…` customers used to
 * BILL clients. Money in and money out are different objects; do not conflate.
 */
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { stripe } from '$lib/server/stripe';
import db from '$lib/server/database/drizzle';
import { affiliateProfileTable } from '$lib/server/database/schemas/affiliate';
import { logger } from '$lib/server/logger';

/**
 * Create the connected account if needed, then return a fresh onboarding link.
 *
 * Account Links are single-use and short-lived, so this is called every time the
 * affiliate clicks "set up payouts" — including to resume a half-finished
 * onboarding.
 */
export async function createConnectOnboardingLink(input: {
	affiliateId: string;
	email: string | null;
	returnUrl: string;
	refreshUrl: string;
}): Promise<{ url: string; accountId: string }> {
	const [affiliate] = await db
		.select({
			id: affiliateProfileTable.id,
			accountId: affiliateProfileTable.stripeConnectAccountId
		})
		.from(affiliateProfileTable)
		.where(eq(affiliateProfileTable.id, input.affiliateId))
		.limit(1);

	if (!affiliate) throw new Error(`Affiliate ${input.affiliateId} not found`);

	let accountId = affiliate.accountId;

	if (!accountId) {
		const account = await stripe.accounts.create({
			type: 'express',
			email: input.email ?? undefined,
			capabilities: { transfers: { requested: true } },
			business_type: undefined, // let the affiliate choose individual vs company
			metadata: { affiliateId: affiliate.id }
		});
		accountId = account.id;

		await db
			.update(affiliateProfileTable)
			.set({ stripeConnectAccountId: accountId, updatedAt: new Date() })
			.where(eq(affiliateProfileTable.id, affiliate.id));

		logger.info('affiliate stripe connect account created', {
			affiliateId: affiliate.id,
			stripe_account_id: accountId
		});
	}

	const link = await stripe.accountLinks.create({
		account: accountId,
		type: 'account_onboarding',
		return_url: input.returnUrl,
		refresh_url: input.refreshUrl
	});

	return { url: link.url, accountId };
}

/**
 * Persist capability state from an `account.updated` webhook.
 *
 * `requirements.currently_due` is stored so the portal can tell the affiliate
 * exactly what Stripe still wants from them, rather than a generic "incomplete".
 *
 * `payouts_enabled` is the gate the payout run checks — until it is true the
 * affiliate's balance simply carries.
 */
export async function syncConnectAccount(account: Stripe.Account): Promise<void> {
	const affiliateId = account.metadata?.affiliateId;

	const where = affiliateId
		? eq(affiliateProfileTable.id, affiliateId)
		: eq(affiliateProfileTable.stripeConnectAccountId, account.id);

	const result = await db
		.update(affiliateProfileTable)
		.set({
			connectChargesEnabled: Boolean(account.charges_enabled),
			connectPayoutsEnabled: Boolean(account.payouts_enabled),
			connectDetailsSubmitted: Boolean(account.details_submitted),
			connectRequirementsDue: account.requirements?.currently_due ?? [],
			connectUpdatedAt: new Date(),
			updatedAt: new Date()
		})
		.where(where)
		.returning({ id: affiliateProfileTable.id });

	if (result.length === 0) {
		logger.warn('account.updated for an unknown affiliate connect account', {
			stripe_account_id: account.id
		});
		return;
	}

	logger.info('affiliate connect account synced', {
		affiliateId: result[0].id,
		payouts_enabled: account.payouts_enabled,
		details_submitted: account.details_submitted
	});
}

/**
 * One-time login link to the affiliate's Express Dashboard.
 *
 * This is the correct destination for an account that has ALREADY completed
 * onboarding — it is where they change bank details, review payout history and
 * retrieve their 1099. Account Links (`accountLinks.create`) are for onboarding
 * an incomplete account; reusing them for account management sends a finished
 * affiliate back through a setup flow.
 *
 * Returns null when there is no connected account yet, so the caller can fall
 * back to onboarding.
 */
export async function createConnectDashboardLink(affiliateId: string): Promise<string | null> {
	const [affiliate] = await db
		.select({ accountId: affiliateProfileTable.stripeConnectAccountId })
		.from(affiliateProfileTable)
		.where(eq(affiliateProfileTable.id, affiliateId))
		.limit(1);

	if (!affiliate?.accountId) return null;

	const link = await stripe.accounts.createLoginLink(affiliate.accountId);
	return link.url;
}
