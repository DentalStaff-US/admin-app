import db from '$lib/server/database/drizzle';
import { eq, and, lt } from 'drizzle-orm';
import { invoiceTable } from '$lib/server/database/schemas/requisition';
import { json, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { notifyOverdueInvoice } from '$lib/server/notifications/transactional';
import { verifyJobRequest } from '$lib/server/jobs/sign';
import { logger } from '$lib/server/logger';

export const POST: RequestHandler = async ({ request }) => {
	const verified = verifyJobRequest(request.headers, 'processInvoiceReminders', CRON_SECRET);
	if (!verified.ok) {
		return new Response(`Unauthorized: ${verified.reason}`, { status: 401 });
	}
	try {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const overdueInvoices = await db
			.select()
			.from(invoiceTable)
			.where(and(eq(invoiceTable.status, 'open'), lt(invoiceTable.dueDate, today)));

		let notified = 0;
		const failures: Array<{ invoiceId: string; error: string }> = [];

		// Per-invoice failures shouldn't kill the whole batch — keep going and report at end.
		for (const invoice of overdueInvoices) {
			try {
				await notifyOverdueInvoice(invoice);
				notified++;
			} catch (err) {
				logger.error('processInvoiceReminders notify failed', {
					error: err,
					invoiceId: invoice.id
				});
				failures.push({
					invoiceId: invoice.id,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}

		logger.event('cron_processInvoiceReminders_completed', {
			overdue_count: overdueInvoices.length,
			notified,
			failure_count: failures.length
		});

		return json({ success: true, count: overdueInvoices.length, notified, failures });
	} catch (error) {
		logger.error('processInvoiceReminders job failed', { error });
		return new Response('Internal Server Error', { status: 500 });
	}
};
