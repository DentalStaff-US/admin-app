import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { authenticateUser } from '$lib/server/serverUtils';
import { json, type RequestHandler } from '@sveltejs/kit';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { getCandidateDocumentEditability } from '$lib/server/documents/candidateDocumentGuards';
import { disciplineTable } from '$lib/server/database/schemas/skill';
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
		// `getTableColumns` keeps this a full row (the UI relies on every column,
		// `disciplineId` and `expiryDate` included) while still allowing the joined
		// discipline label, which saves the client a second lookup to render
		// "Applies to: Dental Hygienist (RDH)".
		const documents = await db
			.select({
				...getTableColumns(candidateDocumentUploadsTable),
				disciplineName: disciplineTable.name,
				disciplineAbbreviation: disciplineTable.abbreviation
			})
			.from(candidateDocumentUploadsTable)
			.leftJoin(disciplineTable, eq(disciplineTable.id, candidateDocumentUploadsTable.disciplineId))
			.where(eq(candidateDocumentUploadsTable.candidateId, candidateProfile.id))
			.orderBy(desc(candidateDocumentUploadsTable.createdAt));

		// Lets the UI render read-only rather than offering controls that the
		// write endpoints would reject.
		const editability = await getCandidateDocumentEditability(candidateProfile.id);

		return json(
			{
				success: true,
				documents,
				editable: editability.editable,
				lockReason: editability.reason,
				// Credential expiry / discipline link stay correctable after approval, so
				// the settings page can render those cells editable while the type cell
				// and Delete remain locked.
				canEditCredentialMetadata: editability.canEditCredentialMetadata
			},
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
