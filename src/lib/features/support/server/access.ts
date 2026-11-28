/**
 * Who may open, comment on, close or reopen a support ticket: DTSS admins, or
 * the person who reported it — the same set the support list shows a
 * non-admin. Before this, any logged-in user could do all four by ticket id.
 * Not found and not yours both answer 404.
 */
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { checkIsAdmin } from '$lib/_helpers/checkIsAdmin';
import db from '$lib/server/database/drizzle';
import { supportTicketTable } from '$lib/server/database/schemas/admin';

export async function assertTicketAccess(
	user: { id: string; role: string },
	ticketId: string
): Promise<void> {
	const [ticket] = await db
		.select({ reportedById: supportTicketTable.reportedById })
		.from(supportTicketTable)
		.where(eq(supportTicketTable.id, ticketId))
		.limit(1);
	if (!ticket) throw error(404, 'Ticket not found');
	if (checkIsAdmin(user.role)) return;
	if (ticket.reportedById !== user.id) throw error(404, 'Ticket not found');
}
