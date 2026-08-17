import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { getCandidateDocumentEditability } from '$lib/server/documents/candidateDocumentGuards';
import { logger } from '$lib/server/logger';

const corsHeaders = {
	'Access-Control-Allow-Origin': env.CANDIDATE_APP_DOMAIN,
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Allow-Credentials': 'true'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};

export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
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
		// Returns every document, resume included. It previously filtered RESUME
		// out, which meant the settings page could neither show nor manage it —
		// the professional had no way to replace a stale resume.
		const documents = await db
			.select()
			.from(candidateDocumentUploadsTable)
			.where(eq(candidateDocumentUploadsTable.candidateId, candidateProfile.id))
			.orderBy(desc(candidateDocumentUploadsTable.createdAt));

		// Lets the UI render read-only rather than offering controls that the
		// write endpoints would reject.
		const editability = await getCandidateDocumentEditability(candidateProfile.id);

		return json(
			{ success: true, documents, editable: editability.editable, lockReason: editability.reason },
			{ status: 200, headers: corsHeaders }
		);
	} catch (err) {
		logger.error('getCandidateDocuments failed', { error: err });
		return json(
			{ success: false, message: 'An unexpected error occurred' },
			{ status: 500, headers: corsHeaders }
		);
	}
};
