import { asc, eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	clientCompanyTable,
	clientProfileTable,
	clientSubscriptionTable
} from '$lib/server/database/schemas/client';
import { userTable } from '$lib/server/database/schemas/auth';

/**
 * Remit-to address as stored on the company. Null fields are normal — callers
 * fall back to the company's first office location when the whole thing is null.
 */
export type BillingAddress = {
	streetOne: string | null;
	streetTwo: string | null;
	city: string | null;
	state: string | null;
	zipcode: string | null;
};

export type BillingRecipient = {
	/** Address invoices and billing correspondence are sent to. */
	email: string;
	/** Display name for the To: header and email copy. */
	name: string;
	/**
	 * Billing address, or null when the client has not set one — in which case
	 * invoice rendering falls back to the first office location.
	 */
	address: BillingAddress | null;
	/**
	 * True when `email` came from `client_companies.billing_email`; false when we
	 * fell back to the account owner's login email because no billing email is
	 * set. Callers use this for logging and for nudging clients to fill it in.
	 */
	isDedicated: boolean;
	/** Account owner's login email — never the billing address. */
	ownerEmail: string;
	ownerFirstName: string;
	ownerLastName: string;
};

/**
 * Single source of truth for "who gets billing mail for this client".
 *
 * Resolution order:
 *   1. `client_companies.billing_email` (the dedicated billing contact)
 *   2. `users.email` (the account owner) — fallback so clients that have never
 *      set a billing email keep receiving invoices exactly as they did before.
 *
 * `clientId` is a `client_profiles.id`, which is what `invoices.client_id` and
 * every invoice notifier already carry.
 *
 * NOTE: `client_companies.client_id` has no unique constraint, so a client can
 * in principle own more than one company row. We order by `created_at` and take
 * the first so the answer is deterministic rather than whatever Postgres
 * happens to return — invoices must not silently change recipient between runs.
 */
export async function resolveBillingRecipient(clientId: string): Promise<BillingRecipient | null> {
	const [row] = await db
		.select({
			billingEmail: clientCompanyTable.billingEmail,
			billingContactName: clientCompanyTable.billingContactName,
			companyName: clientCompanyTable.companyName,
			billingStreetOne: clientCompanyTable.billingStreetOne,
			billingStreetTwo: clientCompanyTable.billingStreetTwo,
			billingCity: clientCompanyTable.billingCity,
			billingState: clientCompanyTable.billingState,
			billingZipcode: clientCompanyTable.billingZipcode,
			ownerEmail: userTable.email,
			ownerFirstName: userTable.firstName,
			ownerLastName: userTable.lastName
		})
		.from(clientProfileTable)
		.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.leftJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
		.where(eq(clientProfileTable.id, clientId))
		.orderBy(asc(clientCompanyTable.createdAt))
		.limit(1);

	if (!row) return null;

	const billingEmail = row.billingEmail?.trim();
	const ownerName = `${row.ownerFirstName} ${row.ownerLastName}`.trim();

	// Treat a wholly-empty address as "not set" so callers fall back cleanly
	// instead of rendering a blank Bill To block.
	const hasAddress = Boolean(
		row.billingStreetOne?.trim() ||
			row.billingCity?.trim() ||
			row.billingState?.trim() ||
			row.billingZipcode?.trim()
	);
	const address: BillingAddress | null = hasAddress
		? {
				streetOne: row.billingStreetOne?.trim() || null,
				streetTwo: row.billingStreetTwo?.trim() || null,
				city: row.billingCity?.trim() || null,
				state: row.billingState?.trim() || null,
				zipcode: row.billingZipcode?.trim() || null
			}
		: null;

	if (billingEmail) {
		return {
			email: billingEmail,
			name: row.billingContactName?.trim() || row.companyName?.trim() || ownerName,
			address,
			isDedicated: true,
			ownerEmail: row.ownerEmail,
			ownerFirstName: row.ownerFirstName,
			ownerLastName: row.ownerLastName
		};
	}

	return {
		email: row.ownerEmail,
		name: ownerName,
		address,
		isDedicated: false,
		ownerEmail: row.ownerEmail,
		ownerFirstName: row.ownerFirstName,
		ownerLastName: row.ownerLastName
	};
}

/** Render a billing address as the display lines used by the invoice PDF. */
export function formatBillingAddressLines(address: BillingAddress): string[] {
	const lines: string[] = [];
	const street = [address.streetOne, address.streetTwo].filter(Boolean).join(', ');
	const cityLine = [address.city, [address.state, address.zipcode].filter(Boolean).join(' ').trim()]
		.filter(Boolean)
		.join(', ');
	if (street) lines.push(street);
	if (cityLine) lines.push(cityLine);
	return lines;
}

/**
 * Map our billing address onto Stripe's `customer.address` shape. Country is
 * hardcoded to US — this is a US-only platform and Stripe requires a country
 * whenever an address is supplied at all.
 */
export function toStripeAddress(address: BillingAddress) {
	return {
		line1: address.streetOne ?? undefined,
		line2: address.streetTwo ?? undefined,
		city: address.city ?? undefined,
		state: address.state ?? undefined,
		postal_code: address.zipcode ?? undefined,
		country: 'US'
	};
}

/**
 * Push the resolved billing email and address onto the client's Stripe customer,
 * so Stripe's own receipts, hosted invoices and dunning use the billing contact
 * rather than the login address. Call after any write that can change either.
 *
 * Safe to call unconditionally: no-ops when the client has no Stripe customer
 * yet, or when Stripe already holds the right values. Errors propagate — the
 * caller decides whether a sync failure should surface (today they log and
 * swallow, since the values re-converge on the next `ensureStripeCustomer`).
 */
export async function syncStripeCustomerBillingEmail(clientId: string): Promise<void> {
	const [sub] = await db
		.select({ stripeCustomerId: clientSubscriptionTable.stripeCustomerId })
		.from(clientSubscriptionTable)
		.where(eq(clientSubscriptionTable.clientId, clientId))
		.limit(1);

	if (!sub?.stripeCustomerId) return;

	const recipient = await resolveBillingRecipient(clientId);
	if (!recipient) return;

	const { stripe } = await import('$lib/server/stripe');
	const customer = await stripe.customers.retrieve(sub.stripeCustomerId);
	if (customer.deleted === true) return;

	const update: { email?: string; address?: ReturnType<typeof toStripeAddress> } = {};

	if (customer.email !== recipient.email) {
		update.email = recipient.email;
	}

	if (recipient.address) {
		const next = toStripeAddress(recipient.address);
		const current = customer.address;
		const differs =
			current?.line1 !== (next.line1 ?? null) ||
			current?.line2 !== (next.line2 ?? null) ||
			current?.city !== (next.city ?? null) ||
			current?.state !== (next.state ?? null) ||
			current?.postal_code !== (next.postal_code ?? null);
		if (differs) update.address = next;
	}

	if (Object.keys(update).length === 0) return;

	await stripe.customers.update(sub.stripeCustomerId, update);
}

/**
 * Same resolution, keyed by the owning user instead of the client profile.
 * Used by the Stripe setup endpoints, which only have a userId in hand.
 */
export async function resolveBillingRecipientByUserId(
	userId: string
): Promise<BillingRecipient | null> {
	const [profile] = await db
		.select({ id: clientProfileTable.id })
		.from(clientProfileTable)
		.where(eq(clientProfileTable.userId, userId))
		.limit(1);

	if (!profile) return null;
	return resolveBillingRecipient(profile.id);
}
