import { eq } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import {
	clientCompanyTable,
	clientProfileTable,
	clientSubscriptionTable
} from '$lib/server/database/schemas/client';
import { requisitionTable } from '$lib/server/database/schemas/requisition';

/**
 * Whether a client can be billed for work at all.
 *
 * A timesheet can only be approved (and invoiced) when the client is either on
 * PAPER invoicing or has a Stripe customer on `client_subscriptions`. Until
 * this gate existed, a STRIPE-billed client with no customer could post
 * requisitions and have shifts worked, and the resulting timesheet then sat
 * un-approvable forever (see approveAndInvoiceTimesheet → NO_STRIPE_CUSTOMER).
 * Checking readiness up front — before a requisition or shift is created —
 * stops that state from being reachable.
 *
 * DB-only on purpose: no Stripe round-trip, so it is cheap enough for page
 * loads. Customer *existence* is the requirement; a payment method is not,
 * because timesheet invoices are `send_invoice` and Stripe emails a pay link.
 */
export type BillingReadiness =
	| { ready: true; method: 'PAPER' | 'STRIPE'; stripeCustomerId: string | null }
	| { ready: false; method: 'STRIPE'; reason: 'NO_STRIPE_CUSTOMER' | 'NO_CLIENT' };

export async function getClientBillingReadiness(
	clientId: string | null | undefined
): Promise<BillingReadiness> {
	if (!clientId) return { ready: false, method: 'STRIPE', reason: 'NO_CLIENT' };

	const [row] = await db
		.select({
			invoiceMethod: clientProfileTable.clientInvoiceMethod,
			stripeCustomerId: clientSubscriptionTable.stripeCustomerId
		})
		.from(clientProfileTable)
		.leftJoin(clientSubscriptionTable, eq(clientSubscriptionTable.clientId, clientProfileTable.id))
		.where(eq(clientProfileTable.id, clientId))
		.limit(1);

	if (!row) return { ready: false, method: 'STRIPE', reason: 'NO_CLIENT' };

	if (row.invoiceMethod === 'PAPER') {
		return { ready: true, method: 'PAPER', stripeCustomerId: row.stripeCustomerId ?? null };
	}
	if (row.stripeCustomerId) {
		return { ready: true, method: 'STRIPE', stripeCustomerId: row.stripeCustomerId };
	}
	return { ready: false, method: 'STRIPE', reason: 'NO_STRIPE_CUSTOMER' };
}

/** Readiness for the client that owns a `client_companies` row (requisitions reference the company). */
export async function getCompanyBillingReadiness(
	companyId: string | null | undefined
): Promise<BillingReadiness> {
	if (!companyId) return { ready: false, method: 'STRIPE', reason: 'NO_CLIENT' };
	const [company] = await db
		.select({ clientId: clientCompanyTable.clientId })
		.from(clientCompanyTable)
		.where(eq(clientCompanyTable.id, companyId))
		.limit(1);
	return getClientBillingReadiness(company?.clientId);
}

/** Readiness for the client behind an existing requisition. */
export async function getRequisitionBillingReadiness(
	requisitionId: number
): Promise<BillingReadiness> {
	const [row] = await db
		.select({ clientId: clientCompanyTable.clientId })
		.from(requisitionTable)
		.innerJoin(clientCompanyTable, eq(clientCompanyTable.id, requisitionTable.companyId))
		.where(eq(requisitionTable.id, requisitionId))
		.limit(1);
	return getClientBillingReadiness(row?.clientId);
}

/**
 * User-facing explanation for a blocked action, worded for who is looking:
 * admins are told how to fix it on the client page; clients are pointed at
 * their own billing settings. `what` is the thing being blocked
 * ("post a requisition", "add shifts").
 */
export function billingNotReadyMessage(opts: {
	audience: 'ADMIN' | 'CLIENT';
	what: string;
	companyName?: string | null;
}): string {
	const who = opts.companyName ? `${opts.companyName}` : 'This client';
	if (opts.audience === 'ADMIN') {
		return (
			`Cannot ${opts.what}: ${who} is billed via Stripe but has no Stripe customer set up yet, ` +
			`so their timesheets could never be invoiced. Open the client's page and use "Setup Customer", ` +
			`or switch the client to paper invoicing, then try again.`
		);
	}
	return (
		`You can't ${opts.what} until billing is set up for your account. ` +
		`Add a payment method under Settings → Billing, or contact us if you've arranged paper invoicing.`
	);
}
