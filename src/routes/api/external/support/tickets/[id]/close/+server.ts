import { error, json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	getSupportTicketDetails,
	updateSupportTicket
} from '$lib/server/database/queries/support';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const user = await authenticateUser(request);
	const { id } = params;
	if (!id) throw error(400, 'Ticket ID required');

	let ticket;
	try {
		ticket = await getSupportTicketDetails(id);
	} catch {
		throw error(404, 'Ticket not found');
	}

	if (ticket.details.ticket.reportedById !== user.id) {
		throw error(403, 'Forbidden');
	}

	await updateSupportTicket(
		id,
		{ status: 'CLOSED', updatedAt: new Date(), closedById: user.id },
		user.id
	);

	return json({ success: true });
};
