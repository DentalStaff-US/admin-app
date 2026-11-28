const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * A name of its own for an upload. The storage key is the file name, so two
 * people uploading "logo.png" would otherwise overwrite each other's image.
 */
export function uniqueImageName(type: string, id: string = crypto.randomUUID()): string | null {
	const ext = EXTENSIONS[type];
	return ext ? `${id}.${ext}` : null;
}

/** Upload an avatar or logo and return its URL. Throws with a readable message. */
export async function uploadImage(file: File): Promise<string> {
	const name = uniqueImageName(file.type);
	if (!name) throw new Error('Choose a JPG, PNG or WebP image.');
	if (file.size > MAX_BYTES) throw new Error('Image too large (2 MB at most).');

	const body = new FormData();
	body.append('file', new File([file], name, { type: file.type }));
	body.append('location', 'images');
	const response = await fetch('/api/uploadFile', { method: 'POST', body });
	const result = await response.json().catch(() => null);
	if (!response.ok || !result?.url) throw new Error('The image could not be uploaded. Please try again.');
	return result.url as string;
}
