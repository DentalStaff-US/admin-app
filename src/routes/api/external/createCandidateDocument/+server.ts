import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { eq } from 'drizzle-orm';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { candidateDocumentUploadSchema } from '$lib/config/zod-schemas';
import { logger } from '$lib/server/logger';
import { syncCandidateOnboardingCompletion } from '$lib/server/onboarding/syncCandidateOnboarding';
import {
	toCredentialExpiryDate,
	validateCredentialLink
} from '$lib/server/certifications/credentialLink';

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
		if (!body || typeof body !== 'object') {
			return json(
				{ success: false, message: 'Invalid request body' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const [candidateProfile] = await db
			.select()
			.from(candidateProfileTable)
			.where(eq(candidateProfileTable.userId, user.id));

		if (!candidateProfile) {
			return json(
				{ success: false, message: 'Candidate profile not found' },
				{ status: 404, headers: corsHeaders }
			);
		}

		const parsedData = candidateDocumentUploadSchema.safeParse(body);

		if (!parsedData.success) {
			return json(
				{ success: false, message: 'Invalid data', errors: parsedData.error.flatten() },
				{ status: 400, headers: corsHeaders }
			);
		}
		const { type, url, filename, filesData, disciplineId } = parsedData.data;

		// Normalise every row first so each credential link can be validated before
		// anything is written — a partially-inserted multi-file upload with one bad
		// link would leave the professional with a document that silently proves
		// nothing.
		const rows = (
			filesData
				? filesData.map((file) => ({
						// Per-file type when the caller supplies one, falling back to the
						// request-level type and finally OTHER. Previously every multi-file
						// upload was forced to OTHER regardless of what the user chose.
						type: file.type ?? type ?? ('OTHER' as const),
						uploadUrl: file.url,
						filename: file.filename,
						expiryDate: toCredentialExpiryDate(file.expiryDate),
						// Per-file link, falling back to the request-level one so a
						// single-file upload can pass it at either level.
						disciplineId: file.disciplineId ?? disciplineId ?? null
					}))
				: [
						{
							type: type || 'OTHER',
							uploadUrl: url as string,
							filename,
							expiryDate: toCredentialExpiryDate(parsedData.data.expiryDate),
							disciplineId: disciplineId ?? null
						}
					]
		).map((r) => ({
			...r,
			candidateId: candidateProfile.id,
			id: crypto.randomUUID(),
			createdAt: new Date(),
			updatedAt: new Date()
		}));

		for (const row of rows) {
			const decision = await validateCredentialLink({
				candidateId: candidateProfile.id,
				disciplineId: row.disciplineId,
				type: row.type,
				expiryDate: row.expiryDate
			});
			if (!decision.ok) {
				return json(
					{ success: false, message: decision.message, reason: decision.reason },
					{ status: 400, headers: corsHeaders }
				);
			}
		}

		await db.insert(candidateDocumentUploadsTable).values(rows);

		// A RESUME upload is normally the last required piece, so re-evaluate
		// completion here. Safe for the optional LICENSE/CERTIFICATE/OTHER uploads
		// too — the sync returns early once the flag is already set.
		await syncCandidateOnboardingCompletion({
			candidateId: candidateProfile.id,
			userId: user.id
		});

		return json(
			{ success: true, message: 'Documents uploaded successfully' },
			{ status: 200, headers: corsHeaders }
		);
	} catch (error) {
		logger.error('createCandidateDocument failed', { error });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
