import { GetObjectCommand, PutObjectCommand, type PutObjectCommandInput } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from './config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type FileType = {
	mimetype: string;
	fileName: string;
	buffer: Buffer;
};

export const uploadFile = async ({ file, location }: { file: FileType; location?: string }) => {
	const key = `${location ? `${location}/` : ''}${file.fileName}`;
	const uploadParams: PutObjectCommandInput = {
		Bucket: BUCKET_NAME,
		Key: key,
		Body: file.buffer,
		ContentType: file.mimetype,
		ACL: 'public-read'
	};

	try {
		const data = await s3Client.send(new PutObjectCommand(uploadParams));
		console.log('Success', data);
		return `https://dentalstaffusdocs.nyc3.cdn.digitaloceanspaces.com/${key}`;
	} catch (err) {
		console.log('Error', err);
		throw err;
	}
};

export const uploadPrivateFile = async ({
	file,
	location
}: {
	file: FileType;
	location?: string;
}) => {
	const key = `${location ? `${location}/` : ''}${file.fileName}`;
	const uploadParams: PutObjectCommandInput = {
		Bucket: BUCKET_NAME,
		Key: key,
		Body: file.buffer,
		ContentType: file.mimetype
		// No ACL — private by default
	};

	try {
		await s3Client.send(new PutObjectCommand(uploadParams));
		return key; // return key, not public URL
	} catch (err) {
		console.error('Error uploading private file', err);
		throw err;
	}
};

export const getSignedDownloadUrl = async (key: string, expiresInSeconds = 900) => {
	const command = new GetObjectCommand({
		Bucket: BUCKET_NAME,
		Key: key
	});

	try {
		return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
	} catch (err) {
		console.error('Error generating signed URL', err);
		throw err;
	}
};
