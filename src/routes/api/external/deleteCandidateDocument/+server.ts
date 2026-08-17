import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { assertCandidateDocumentEditable } from '$lib/server/documents/candidateDocumentGuards';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: corsHeaders });

const payloadSchema = z.object({ documentId: z.string().uuid() });

/**
 * Delete one of the professional's own documents.
 *
 * This endpoint previously existed as an empty file, so the candidate documents
 * page had no way to remove a mistaken upload. Same guard as retyping: refused
 * once the account is approved or the document is admin-locked.
 *
 * Only the DB row is removed; the stored object is left in place deliberately,
 * since an approved candidate's file may still be referenced by admin-side
 * records. Nothing else reads a deleted row.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}

		const body = await request.json().catch(() => null);
		const parsed = payloadSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{ success: false, message: 'Invalid request', errors: parsed.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}

		const [candidateProfile] = await db
			.select({ id: candidateProfileTable.id })
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id))
			.limit(1);

		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const decision = await assertCandidateDocumentEditable({
			documentId: parsed.data.documentId,
			candidateId: candidateProfile.id
		});

		if (!decision.allowed) {
			const status = decision.reason === 'NOT_FOUND' || decision.reason === 'NOT_OWNER' ? 404 : 403;
			return json(
				{ success: false, message: decision.message, reason: decision.reason },
				{ status, headers: corsHeaders }
			);
		}

		await db
			.delete(candidateDocumentUploadsTable)
			.where(eq(candidateDocumentUploadsTable.id, parsed.data.documentId));

		return json(
			{ success: true, message: 'Document deleted' },
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('deleteCandidateDocument failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
