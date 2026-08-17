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
import { syncCandidateOnboardingCompletion } from '$lib/server/onboarding/syncCandidateOnboarding';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => new Response(null, { headers: corsHeaders });

const payloadSchema = z.object({
	documentId: z.string().uuid(),
	type: z.enum(['RESUME', 'LICENSE', 'CERTIFICATE', 'AGREEMENT', 'OTHER']).optional(),
	filename: z.string().max(255).optional(),
	// ISO date, or null to clear. Only meaningful for licenses/certificates.
	expiryDate: z.string().datetime().nullable().optional()
});

/**
 * Let a professional re-categorise or rename one of their own documents.
 *
 * Every mutation goes through `assertCandidateDocumentEditable`, which refuses
 * once the account is approved or the document has been locked by an admin.
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

		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (parsed.data.type !== undefined) patch.type = parsed.data.type;
		if (parsed.data.filename !== undefined) patch.filename = parsed.data.filename;
		if (parsed.data.expiryDate !== undefined) {
			patch.expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;
		}

		const [updated] = await db
			.update(candidateDocumentUploadsTable)
			.set(patch)
			.where(eq(candidateDocumentUploadsTable.id, parsed.data.documentId))
			.returning();

		// Retyping can change completeness in both directions — promoting a file to
		// RESUME may complete the profile. (The sync only ever sets the flag; it
		// never un-completes someone, which would strand them mid-app.)
		await syncCandidateOnboardingCompletion({
			candidateId: candidateProfile.id,
			userId: user.id
		});

		return json(
			{ success: true, message: 'Document updated', document: updated },
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('updateCandidateDocument failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
