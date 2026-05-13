import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { authenticateUser } from '$lib/server/serverUtils';
import {
	createSupportTicket,
	getSupportTicketsForUser
} from '$lib/server/database/queries/support';
import { notifySupportTicketCreated } from '$lib/server/notifications/transactional';
import { getPostHogClient } from '$lib/server/posthog';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: corsHeaders });
};

export const GET: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);
	const tickets = await getSupportTicketsForUser(user.id);
	return json(tickets);
};

const createTicketSchema = z.object({
	title: z.string().min(1),
	expectedResults: z.string().min(1),
	actualResults: z.string().min(1),
	stepsToReproduce: z.string().optional().default('')
});

export const POST: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = createTicketSchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, `Invalid request: ${JSON.stringify(parsed.error.errors)}`);
	}

	const id = crypto.randomUUID();
	const newTicket = await createSupportTicket({
		id,
		title: parsed.data.title,
		expectedResult: parsed.data.expectedResults,
		actualResults: parsed.data.actualResults,
		stepsToReproduce: parsed.data.stepsToReproduce,
		reportedById: user.id
	});

	if (!newTicket) {
		throw error(500, 'Failed to create support ticket');
	}

	try {
		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: user.id,
			event: 'support_ticket_created',
			properties: { ticket_id: newTicket.id, source: 'professional' }
		});
	} catch (e) {
		console.error('[external/support/tickets] posthog capture failed:', e);
	}

	await notifySupportTicketCreated();

	return json({ id: newTicket.id });
};
