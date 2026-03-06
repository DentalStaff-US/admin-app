import db from '../database/drizzle';
import { clientSubscriptionTable, clientProfileTable } from '../database/schemas/client';
import { stripe } from '../stripe';
import { userTable } from '../database/schemas/auth';
import { eq, notInArray } from 'drizzle-orm';

// need to iterate through all client profiles and check for a stripe customer with an email match, then update our DB with the stripe customer ID if found and add clientSubscription record

export default async function migrateStripeCustomers() {
	const existingSubscriptions = await db.select().from(clientSubscriptionTable);

	const clients = await db
		.select({
			profile: clientProfileTable,
			user: userTable
		})
		.from(clientProfileTable)
		.innerJoin(userTable, eq(clientProfileTable.userId, userTable.id))
		.where(
			notInArray(
				clientProfileTable.id,
				existingSubscriptions.map((sub) => sub.clientId)
			)
		);

	for (const client of clients) {
		try {
			const stripeCustomer = await stripe.customers.list({
				email: client.user.email,
				limit: 1
			});

			if (stripeCustomer.data.length > 0) {
				const customer = stripeCustomer.data[0];
				console.log(`Found Stripe customer for ${client.user.email}: ${customer.id}`);

				// Update our DB with the Stripe customer ID
				await db.transaction(async (tx) => {
					await tx.insert(clientSubscriptionTable).values({
						stripeCustomerId: customer.id,
						id: crypto.randomUUID(),
						clientId: client.profile.id
					});

					await tx
						.update(userTable)
						.set({ stripeCustomerId: customer.id })
						.where(eq(userTable.id, client.user.id));
				});
			} else {
				console.log(`No Stripe customer found for ${client.user.email}`);
			}
		} catch (err) {
			console.error(`Error processing client ${client.user.email}:`, err);
		}
	}

	console.log('Migration completed');
}

migrateStripeCustomers()
	.then(() => {
		console.log('Done');
		process.exit(0);
	})
	.catch((err) => {
		console.error('Migration failed:', err);
		process.exit(1);
	});
