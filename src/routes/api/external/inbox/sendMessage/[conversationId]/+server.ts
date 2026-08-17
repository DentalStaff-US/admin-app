import { error, json } from '@sveltejs/kit';
import { InboxService } from '$lib/server/inbox';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { and } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { conversationParticipantsTable } from '$lib/server/database/schemas/messages';
import db from '$lib/server/database/drizzle';
import { authenticateUser } from '$lib/server/serverUtils';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

// Schema for validating external message requests
const externalMessageSchema = z.object({
	senderId: z.string(),
	body: z.string().min(1),
	isSystemMessage: z.boolean().default(false)
});

export const POST: RequestHandler = async ({ params, request }) => {
	const { conversationId } = params;

	if (!conversationId) {
		throw error(400, 'Conversation ID is required');
	}

	try {
		await authenticateUser(request);
		// Parse and validate the request body
		const rawBody = await request.json();
		const validatedData = externalMessageSchema.parse(rawBody);

		console.log({ rawBody, validatedData });

		const participants = await db
			.select()
			.from(conversationParticipantsTable)
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationId),
					eq(conversationParticipantsTable.isActive, true)
				)
			);

		console.log({ participants, conversationId });

		const [participant] = await db
			.select()
			.from(conversationParticipantsTable)
			.where(
				and(
					eq(conversationParticipantsTable.conversationId, conversationId),
					eq(conversationParticipantsTable.userId, validatedData.senderId),
					eq(conversationParticipantsTable.isActive, true)
				)
			)
			.limit(1);

		if (!participant) {
			throw error(403, 'User is not an active participant in this conversation');
		}

		// Initialize inbox service and send message
		const inboxService = new InboxService();

		// Send the message
		const messageId = await inboxService.sendMessage({
			conversationId,
			senderId: validatedData.senderId,
			body: validatedData.body,
			isSystemMessage: validatedData.isSystemMessage
		});

		// Return success response
		return json({
			success: true,
			messageId,
			conversationId
		});
	} catch (err) {
		// Handle Zod validation errors
		if (err instanceof z.ZodError) {
			throw error(400, `Invalid request data: ${JSON.stringify(err.errors)}`);
		}

		// Handle other errors
		logger.error('inbox.sendMessage failed', { error: err, conversationId });
		throw error(500, 'Failed to send message');
	}
};
