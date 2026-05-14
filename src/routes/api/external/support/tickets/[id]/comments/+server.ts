import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	createSupportTicketComment,
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

const commentSchema = z.object({
	body: z.string().min(1, 'Comment cannot be empty')
});

export const POST: RequestHandler = async ({ params, request }) => {
	const user = await authenticateUser(request);
	const { id } = params;
	if (!id) throw error(400, 'Ticket ID required');

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = commentSchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${JSON.stringify(parsed.error.errors)}`);
	}

	let ticket;
	try {
		ticket = await getSupportTicketDetails(id);
	} catch {
		throw error(404, 'Ticket not found');
	}

	if (ticket.details.ticket.reportedById !== user.id) {
		throw error(403, 'Forbidden');
	}

	const newComment = await createSupportTicketComment(
		{
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date(),
			supportTicketId: id,
			fromId: user.id,
			body: parsed.data.body
		},
		user.id
	);

	await updateSupportTicket(id, { updatedAt: new Date() }, user.id);

	return json({ id: newComment?.id });
};
