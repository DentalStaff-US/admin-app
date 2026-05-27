// Internal endpoint for any logged-in user to open a support ticket from an
// in-app modal. The external candidate API has its own JWT-authed endpoint
// under /api/external/support/tickets — this one uses session auth.
//
// All creation paths funnel through createSupportTicket(), which fires the
// admin notification once per ticket.

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { createSupportTicket } from '$lib/server/database/queries/support';
import { logger } from '$lib/server/logger';

const bodySchema = z.object({
	title: z.string().trim().min(1, 'Title is required').max(200),
	body: z.string().trim().max(5000).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, parsed.error.errors[0]?.message ?? 'Invalid request');
	}

	try {
		const ticket = await createSupportTicket({
			id: nanoid(),
			title: parsed.data.title,
			additionalNotes: parsed.data.body ?? null,
			reportedById: user.id,
			status: 'NEW'
		});

		if (!ticket) {
			throw error(500, 'Failed to create support ticket');
		}

		return json({ id: ticket.id, title: ticket.title });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
			throw err;
		}
		logger.error('internal support ticket create failed', { error: err, distinctId: user.id });
		throw error(500, 'Failed to create support ticket');
	}
};
