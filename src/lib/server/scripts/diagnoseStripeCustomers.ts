/**
 * READ-ONLY diagnostic for the corrupted-stripe-customer-id issue.
 *
 * Context: prod Stripe customers have UUID ids (imported account). A handful of
 * DB rows instead hold a real `cus_` id — these were created by the setup flow
 * running under TEST/LOCAL keys (ensureStripeCustomer create-on-miss) and they
 * do NOT resolve in prod, so invoicing throws "No such customer".
 *
 * This script makes NO writes. For every row whose stripe_customer_id looks like
 * a Stripe `cus_` id, it:
 *   1. tries to retrieve that id against the CURRENT keys,
 *   2. looks the client up by email to find the real (UUID) prod customer,
 *   3. prints a proposed action.
 *
 * IMPORTANT: run with .env Stripe keys pointed at PROD, or every lookup is empty.
 *
 * Run:  npx tsx src/lib/server/scripts/diagnoseStripeCustomers.ts
 */
import db from '../database/drizzle';
import { clientSubscriptionTable, clientProfileTable } from '../database/schemas/client';
import { userTable } from '../database/schemas/auth';
import { stripe } from '../stripe';
import { eq, like } from 'drizzle-orm';
import type Stripe from 'stripe';

const CUS_PREFIX = 'cus_';

async function retrieveResolves(id: string): Promise<boolean> {
	try {
		const c = await stripe.customers.retrieve(id);
		return !(c as Stripe.DeletedCustomer).deleted;
	} catch (err) {
		const e = err as Stripe.errors.StripeError;
		if (e?.code === 'resource_missing') return false;
		throw err; // real error (auth/network) — surface it, don't mislead
	}
}

async function diagnose() {
	// All subscription rows whose stripe_customer_id is a Stripe cus_ id.
	const rows = await db
		.select({
			subId: clientSubscriptionTable.id,
			clientId: clientSubscriptionTable.clientId,
			dbCustomerId: clientSubscriptionTable.stripeCustomerId,
			email: userTable.email,
			userId: userTable.id,
			userCustomerId: userTable.stripeCustomerId
		})
		.from(clientSubscriptionTable)
		.innerJoin(clientProfileTable, eq(clientProfileTable.id, clientSubscriptionTable.clientId))
		.innerJoin(userTable, eq(userTable.id, clientProfileTable.userId))
		.where(like(clientSubscriptionTable.stripeCustomerId, `${CUS_PREFIX}%`));

	console.log(`\nFound ${rows.length} row(s) with a cus_ id in client_subscriptions.\n`);

	for (const row of rows) {
		console.log('────────────────────────────────────────────────────────');
		console.log(`client_id        : ${row.clientId}`);
		console.log(`email            : ${row.email}`);
		console.log(`db (subscription): ${row.dbCustomerId}`);
		console.log(`db (users)       : ${row.userCustomerId ?? '∅'}`);

		const resolves = row.dbCustomerId ? await retrieveResolves(row.dbCustomerId) : false;
		console.log(`resolves in this Stripe mode? : ${resolves ? 'YES' : 'NO'}`);

		// Find the real prod customer(s) by email.
		let matches: Stripe.Customer[] = [];
		if (row.email) {
			const list = await stripe.customers.list({ email: row.email, limit: 10 });
			matches = list.data;
		}

		if (matches.length === 0) {
			console.log('prod customer by email        : NONE FOUND');
		} else {
			for (const m of matches) {
				const created = new Date(m.created * 1000).toISOString().slice(0, 10);
				console.log(
					`prod customer by email        : ${m.id}  (created ${created}, name="${m.name ?? ''}")`
				);
			}
		}

		// Proposed action.
		const uuidMatch = matches.find((m) => !m.id.startsWith(CUS_PREFIX));
		if (resolves) {
			console.log('ACTION           : OK — id resolves; likely a genuine new prod customer. Leave as-is.');
		} else if (uuidMatch) {
			console.log(`ACTION           : RESTORE -> set stripe_customer_id = '${uuidMatch.id}'`);
		} else if (matches.length > 0) {
			console.log(`ACTION           : REVIEW — email match exists but only cus_ ids: ${matches.map((m) => m.id).join(', ')}`);
		} else {
			console.log('ACTION           : REVIEW — no resolving id and no email match. Manual lookup needed.');
		}
	}

	console.log('────────────────────────────────────────────────────────');
	console.log('\nNo changes were made. This script is read-only.\n');
}

diagnose()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('Diagnostic failed:', err);
		process.exit(1);
	});
