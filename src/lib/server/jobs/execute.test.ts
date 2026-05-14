import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeJob } from './execute';

const opts = { baseUrl: 'https://api.test', secret: 'test-secret' };

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('executeJob — happy path', () => {
	it('parses a JSON response and returns body + status', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ success: true, count: 3 }), { status: 200 })
			)
		);
		const res = await executeJob('processX', '/jobs/x', opts);
		expect(res.ok).toBe(true);
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ success: true, count: 3 });
	});

	it('falls back to raw text when the response is not JSON', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('OK', { status: 200 })));
		const res = await executeJob('processX', '/jobs/x', opts);
		expect(res.body).toBe('OK');
	});

	it('signs the request with the job name', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
		await executeJob('processY', '/jobs/y', opts);
		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers['x-job-name']).toBe('processY');
		expect(headers['x-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(headers['x-signature']).toMatch(/^[a-f0-9]{64}$/);
	});
});

describe('executeJob — fail paths', () => {
	// REGRESSION: the cron entry point used to do
	// `JSON.stringify(res.body).slice(0, 500)` which crashed when body was
	// undefined (which happens on every network failure). The contract is
	// now: `body` MAY be undefined on failure; callers must handle that.
	it('returns body=undefined when fetch rejects (network failure)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
		const res = await executeJob('processX', '/jobs/x', opts);
		expect(res.ok).toBe(false);
		expect(res.body).toBeUndefined();
		expect(res.error).toBe('ECONNREFUSED');
	});

	it('returns body present but ok=false for HTTP error responses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: 'bad' }), { status: 500 })
			)
		);
		const res = await executeJob('processX', '/jobs/x', opts);
		expect(res.ok).toBe(false);
		expect(res.status).toBe(500);
		expect(res.body).toEqual({ error: 'bad' });
	});

	it('returns body=undefined on timeout (AbortError)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init: RequestInit) => {
				return new Promise((_, reject) => {
					init.signal?.addEventListener('abort', () => {
						reject(new DOMException('aborted', 'AbortError'));
					});
				});
			})
		);
		const res = await executeJob('processX', '/jobs/x', { ...opts, timeoutMs: 20 });
		expect(res.ok).toBe(false);
		expect(res.body).toBeUndefined();
	});

	it('records durationMs even on failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
		const res = await executeJob('processX', '/jobs/x', opts);
		expect(res.durationMs).toBeGreaterThanOrEqual(0);
	});
});
