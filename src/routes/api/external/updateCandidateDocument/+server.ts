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
import {
	toCredentialExpiryDate,
	validateCredentialLink
} from '$lib/server/certifications/credentialLink';
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
	// Calendar date ('YYYY-MM-DD', or a full ISO datetime), or null to clear. Only
	// meaningful for licenses/certificates.
	expiryDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/)
		.nullable()
		.optional(),
	// The Experience & Rates entry this credential evidences, or null to unlink.
	disciplineId: z.string().min(1).nullable().optional(),
	/**
	 * Designating an already-uploaded file as the credential for a discipline. Lets an
	 * approved professional set `type` (to LICENSE/CERTIFICATE only) together with the
	 * link and expiry — the path for legacy documents that were all forced to OTHER.
	 * See assertCandidateDocumentEditable.
	 */
	intent: z.literal('DESIGNATE_CREDENTIAL').optional()
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

		// Which fields this request actually writes — drives the approval carve-outs.
		const touchedFields = (['type', 'filename', 'expiryDate', 'disciplineId'] as const).filter(
			(f) => parsed.data[f] !== undefined
		);

		const decision = await assertCandidateDocumentEditable({
			documentId: parsed.data.documentId,
			candidateId: candidateProfile.id,
			fields: touchedFields,
			intent: parsed.data.intent,
			nextType: parsed.data.type ?? null
		});

		if (!decision.allowed) {
			const status = decision.reason === 'NOT_FOUND' || decision.reason === 'NOT_OWNER' ? 404 : 403;
			return json(
				{ success: false, message: decision.message, reason: decision.reason },
				{ status, headers: corsHeaders }
			);
		}

		// The document's post-patch type and expiry, which is what the credential-link
		// rules must be checked against — not the values being sent, which may omit
		// either field.
		const [existing] = await db
			.select({
				type: candidateDocumentUploadsTable.type,
				expiryDate: candidateDocumentUploadsTable.expiryDate,
				disciplineId: candidateDocumentUploadsTable.disciplineId
			})
			.from(candidateDocumentUploadsTable)
			.where(eq(candidateDocumentUploadsTable.id, parsed.data.documentId))
			.limit(1);

		const patch: Record<string, unknown> = { updatedAt: new Date() };
		if (parsed.data.type !== undefined) patch.type = parsed.data.type;
		if (parsed.data.filename !== undefined) patch.filename = parsed.data.filename;
		if (parsed.data.expiryDate !== undefined) {
			patch.expiryDate = toCredentialExpiryDate(parsed.data.expiryDate);
		}
		if (parsed.data.disciplineId !== undefined) patch.disciplineId = parsed.data.disciplineId;

		const nextType = (patch.type ?? existing?.type) as string | null;
		const nextDisciplineId = (
			parsed.data.disciplineId !== undefined ? parsed.data.disciplineId : existing?.disciplineId
		) as string | null;
		const nextExpiry = (
			parsed.data.expiryDate !== undefined ? patch.expiryDate : existing?.expiryDate
		) as Date | null;

		const linkDecision = await validateCredentialLink({
			candidateId: candidateProfile.id,
			disciplineId: nextDisciplineId,
			type: nextType,
			expiryDate: nextExpiry
		});
		if (!linkDecision.ok) {
			return json(
				{ success: false, message: linkDecision.message, reason: linkDecision.reason },
				{ status: 400, headers: corsHeaders }
			);
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
