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
		const { type, url, filename, filesData } = parsedData.data;

		if (filesData) {
			const candidateDocuments = filesData.map((file: { url: string; filename: string }) => ({
				candidateId: candidateProfile.id,
				type: 'OTHER' as const,
				uploadUrl: file.url,
				createdAt: new Date(),
				updatedAt: new Date(),
				id: crypto.randomUUID(),
				filename: file.filename
			}));
			await db.insert(candidateDocumentUploadsTable).values(candidateDocuments);
		} else {
			const candidateDocument = {
				candidateId: candidateProfile.id,
				type: type || 'OTHER',
				uploadUrl: url as string,
				createdAt: new Date(),
				updatedAt: new Date(),
				id: crypto.randomUUID(),
				filename
			};
			await db.insert(candidateDocumentUploadsTable).values(candidateDocument);
		}

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
