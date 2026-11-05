// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

const uploadFile = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/uploads', () => ({ uploadFile }));
vi.mock('$lib/server/logger', () => ({ logger: { error: vi.fn() } }));

function send(user: object | null, body?: FormData) {
	const form = body ?? new FormData();
	const request = new Request('http://test/api/uploadFile', { method: 'POST', body: form });
	return POST({ request, locals: { user } } as any);
}

function withFile() {
	const form = new FormData();
	form.append('file', new File(['hello'], 'cv.pdf', { type: 'application/pdf' }));
	form.append('location', 'candidate-documents');
	return form;
}

describe('POST /api/uploadFile', () => {
	beforeEach(() => {
		uploadFile.mockReset();
	});

	it('refuses a logged-out request and stores nothing', async () => {
		const response = await send(null, withFile());
		expect(response.status).toBe(401);
		expect(uploadFile).not.toHaveBeenCalled();
	});

	it('stores the file for a logged-in user', async () => {
		uploadFile.mockResolvedValue('https://files/cv.pdf');
		const response = await send({ id: 'u1' }, withFile());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, url: 'https://files/cv.pdf', fileName: 'cv.pdf' });
	});

	it('returns a real 400 when there is no file', async () => {
		const response = await send({ id: 'u1' });
		expect(response.status).toBe(400);
	});

	it('returns a real 500 when storage fails', async () => {
		uploadFile.mockRejectedValue(new Error('storage down'));
		const response = await send({ id: 'u1' }, withFile());
		expect(response.status).toBe(500);
	});
});
