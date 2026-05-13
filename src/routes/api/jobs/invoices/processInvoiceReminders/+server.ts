import db from '$lib/server/database/drizzle';
import { eq, and, lt } from 'drizzle-orm';
import { invoiceTable } from '$lib/server/database/schemas/requisition';
import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { notifyOverdueInvoice } from '$lib/server/notifications/transactional';
import { verifyJobRequest } from '$lib/server/jobs/sign';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processInvoiceReminders', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}
	try {
		console.log('Starting processInvoiceRemindersJob');

		// Get all invoices that are past their due date and still open
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Normalize to start of the day
		console.log(`Today's date: ${today.toISOString()}`);

		// Query to find all overdue invoices
		const overdueInvoices = await db
			.select()
			.from(invoiceTable)
			.where(and(eq(invoiceTable.status, 'open'), lt(invoiceTable.dueDate, today)));

		console.log(`Found ${overdueInvoices.length} overdue invoices`);

		// Process each overdue invoice
		for (const invoice of overdueInvoices) {
			console.log(`Processing overdue invoice ID: ${invoice.id}`);
			await notifyOverdueInvoice(invoice);
			console.log(`Reminder sent for invoice ID: ${invoice.id}`);
		}

		return json({ success: true, count: overdueInvoices.length });
	} catch (error) {
		console.error('Error processing invoice reminders', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
