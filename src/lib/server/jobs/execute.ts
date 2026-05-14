import { signJobRequest } from './sign';

export type ExecuteOptions = {
	baseUrl: string;
	secret: string;
	timeoutMs?: number;
};

export type ExecuteResult = {
	ok: boolean;
	status?: number;
	body?: unknown;
	error?: string;
	durationMs: number;
};

export async function executeJob(
	jobName: string,
	endpoint: string,
	opts: ExecuteOptions
): Promise<ExecuteResult> {
	const url = `${opts.baseUrl.replace(/\/$/, '')}${endpoint}`;
	const headers = signJobRequest(jobName, opts.secret);
	const controller = new AbortController();
	const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const startedAt = Date.now();

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { ...headers, 'content-type': 'application/json' },
			body: '{}',
			signal: controller.signal
		});
		const text = await res.text();
		let body: unknown = text;
		try {
			body = JSON.parse(text);
		} catch {
			// non-JSON body — leave as text
		}
		return { ok: res.ok, status: res.status, body, durationMs: Date.now() - startedAt };
	} catch (err) {
		// undici's `fetch failed` is a useless top-level message — the actual
		// reason (ECONNREFUSED, ENOTFOUND, certificate errors, etc.) lives in
		// `error.cause`. Surface both so PostHog has enough to diagnose.
		const baseMessage = err instanceof Error ? err.message : String(err);
		const cause =
			err instanceof Error && err.cause
				? err.cause instanceof Error
					? `${err.cause.name}: ${err.cause.message}`
					: String(err.cause)
				: undefined;
		return {
			ok: false,
			error: cause ? `${baseMessage} (cause: ${cause})` : baseMessage,
			durationMs: Date.now() - startedAt
		};
	} finally {
		clearTimeout(timer);
	}
}
