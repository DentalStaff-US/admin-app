import { uploadFile } from '$lib/server/uploads';
import type { FileType } from '$lib/server/uploads';
import { fail, json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/database/drizzle';
import { env } from '$env/dynamic/private';
import { authenticateUser } from '$lib/server/serverUtils';
import { eq } from 'drizzle-orm';
import { userTable } from '$lib/server/database/schemas/auth';
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

export const POST = async ({ request }: RequestEvent) => {
	try {
		const user = await authenticateUser(request);
		if (!user) {
			return json(
				{ success: false, message: 'Unauthorized' },
				{ status: 401, headers: corsHeaders }
			);
		}
		// Parse the multipart form data
		const { fileName, mimeType, fileData } = await request.json();

		// Convert base64 back to buffer
		const buffer = Buffer.from(fileData, 'base64');

		const fileToUpload: FileType = {
			fileName,
			mimetype: mimeType,
			buffer
		};

		// Upload to S3
		const fileUrl = await uploadFile({ file: fileToUpload, location: 'images' });

		if (fileUrl) {
			await db.update(userTable).set({ avatarUrl: fileUrl }).where(eq(userTable.id, user.id));
		}

		return json({ success: true, file: fileUrl });
	} catch (error) {
		logger.error('upload.avatar failed', { error });
		return fail(500, { success: false, message: 'File upload failed' });
	}
};
