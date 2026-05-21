import { uploadFile } from '$lib/server/uploads';
import type { FileType } from '$lib/server/uploads';
import { fail, json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import {
	candidateDocumentUploadsTable,
	candidateProfileTable
} from '$lib/server/database/schemas/candidate';
import { env } from '$env/dynamic/private';
import { authenticateUser } from '$lib/server/serverUtils';
import { eq } from 'drizzle-orm';
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

export const POST = async ({ request }: RequestEvent) => {
	const contentType = request.headers.get('Content-Type');
	if (!contentType || !contentType.startsWith('multipart/form-data')) {
		return fail(400, { success: false, message: 'Invalid content type' });
	}

	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}
		// Parse the multipart form data
		const formData = await request.formData();
		const uploadedFile = formData.get('file');

		if (!uploadedFile || !(uploadedFile instanceof File)) {
			return fail(400, { success: false, message: 'No file provided' });
		}

		// Convert the file to an ArrayBuffer
		const buffer = await uploadedFile.arrayBuffer();

		const fileToUpload: FileType = {
			fileName: uploadedFile.name,
			mimetype: uploadedFile.type,
			buffer: Buffer.from(buffer)
		};

		// Upload to S3
		const fileUrl = await uploadFile({ file: fileToUpload, location: 'candidate-documents' });

		if (fileUrl) {
			const [candidateProfile] = await db
				.select()
				.from(candidateProfileTable)
				.where(eq(candidateProfileTable.userId, user.id));

			await db
				.insert(candidateDocumentUploadsTable)
				.values({
					id: crypto.randomUUID(),
					candidateId: candidateProfile.id,
					uploadUrl: fileUrl,
					type: 'RESUME'
				})
				.onConflictDoNothing()
				.returning();
		}

		return json({ success: true, file: fileUrl });
	} catch (error) {
		logger.error('upload.resume failed', { error });
		return fail(500, { success: false, message: 'File upload failed' });
	}
};
