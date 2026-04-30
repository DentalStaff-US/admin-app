import Stripe from 'stripe';
// import { STRIPE_SECRET_KEY } from '$env/static/private';
import * as dotenv from 'dotenv';
dotenv.config();
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createStripeInvoice(
	stripeCustomerId: string,
	lineItems: Array<{
		amountInCents: number;
		description?: string;
		currency?: string;
		quantity?: number;
	}>,
	metadata: Record<string, any> = {},
	additionalNotes?: string,
	dueDate?: Date | string
): Promise<Stripe.Invoice> {
	if (!stripeCustomerId) {
		throw new Error('Stripe customer ID is required');
	}

	try {
		console.log('Starting invoice creation for customer:', stripeCustomerId);
		console.log('Line items to create:', lineItems);

		// Convert dueDate to Unix timestamp
		let dueDateTimestamp: number | undefined;
		if (dueDate) {
			const date = new Date(dueDate);
			dueDateTimestamp = Math.floor(date.getTime() / 1000);
			console.log('Due date timestamp:', dueDateTimestamp);
		}

		// Create the invoice in draft state
		const invoice = await stripe.invoices.create({
			customer: stripeCustomerId,
			collection_method: 'send_invoice',
			due_date: dueDateTimestamp,
			days_until_due: dueDateTimestamp ? undefined : 1,
			auto_advance: false,
			metadata,
			description: additionalNotes || 'Invoice for services rendered'
		});

		console.log('Created invoice:', invoice.id);

		// Add line items to the invoice
		const createdItems = [];
		for (let i = 0; i < lineItems.length; i++) {
			const item = lineItems[i];
			console.log(`Creating invoice item ${i + 1}:`, item);

			let invoiceItemParams;

			if (item.quantity && item.quantity > 1) {
				// Use unit_amount + quantity approach
				const unitAmount = Math.round(item.amountInCents / item.quantity);
				invoiceItemParams = {
					invoice: invoice.id,
					customer: stripeCustomerId,
					unit_amount: unitAmount,
					quantity: item.quantity,
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				};
				console.log(`Using unit_amount approach: ${unitAmount} x ${item.quantity}`);
			} else {
				// Use total amount approach (no quantity)
				invoiceItemParams = {
					invoice: invoice.id,
					customer: stripeCustomerId,
					amount: item.amountInCents,
					currency: item.currency || 'usd',
					description: item.description || 'Service'
				};
				console.log(`Using total amount approach: ${item.amountInCents}`);
			}

			console.log('Invoice item params:', invoiceItemParams);

			const invoiceItem = await stripe.invoiceItems.create(invoiceItemParams);

			console.log(`Created invoice item ${i + 1}:`, invoiceItem.id, 'Amount:', invoiceItem.amount);
			createdItems.push(invoiceItem);
		}

		console.log(`Total invoice items created: ${createdItems.length}`);

		// Retrieve the invoice to see the items before finalizing
		const invoiceWithItems = await stripe.invoices.retrieve(invoice.id);
		console.log('Invoice lines before finalizing:', invoiceWithItems.lines.data.length);
		console.log(
			'Line items:',
			invoiceWithItems.lines.data.map((line) => ({
				id: line.id,
				description: line.description,
				amount: line.amount,
				quantity: line.quantity
			}))
		);

		// Finalize the invoice
		console.log('Finalizing invoice...');
		const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
		console.log('Finalized invoice lines:', finalizedInvoice.lines.data.length);

		// Send the invoice
		console.log('Sending invoice...');
		const customer = await stripe.customers.retrieve(stripeCustomerId);
		if (!('email' in customer) || !customer.email) {
			throw new Error('Stripe customer has no email — cannot send invoice');
		}

		await stripe.invoices.sendInvoice(finalizedInvoice.id);
		console.log('Invoice sent successfully');

		return finalizedInvoice;
	} catch (error) {
		console.error('Error creating Stripe invoice:', error);
		console.error('Error details:', {
			type: (error as any).type,
			message: (error as any).message,
			param: (error as any).param
		});
		throw error;
	}
}
