import { uploadFile } from '$lib/server/uploads';
import type { FileType } from '$lib/server/uploads';
import { json, type RequestEvent } from '@sveltejs/kit';
import { logger } from '$lib/server/logger';

export const POST = async ({ request, locals }: RequestEvent) => {
	if (!locals.user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401 });
	}

	const contentType = request.headers.get('Content-Type');
	if (!contentType || !contentType.startsWith('multipart/form-data')) {
		return json({ success: false, message: 'Invalid content type' }, { status: 400 });
	}

	try {
		// Parse the multipart form data
		const formData = await request.formData();
		const location = formData.get('location') as string;
		const uploadedFile = formData.get('file');

		if (!uploadedFile || !(uploadedFile instanceof File)) {
			return json({ success: false, message: 'No file provided' }, { status: 400 });
		}

		// Convert the file to an ArrayBuffer
		const buffer = await uploadedFile.arrayBuffer();

		const fileToUpload: FileType = {
			fileName: uploadedFile.name,
			mimetype: uploadedFile.type,
			buffer: Buffer.from(buffer)
		};

		// Upload to S3
		const url = await uploadFile({ file: fileToUpload, location });

		return json({ success: true, url, fileName: uploadedFile.name });
	} catch (error) {
		logger.error('api.uploadFile failed', { error });
		return json({ success: false, message: 'File upload failed' }, { status: 500 });
	}
};
