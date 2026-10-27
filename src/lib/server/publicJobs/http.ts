/**
 * HTTP plumbing shared by the /api/public/jobs/* routes: kill switch, CORS,
 * caching headers and a per-IP rate limit. Routes stay thin shells:
 *
 *   const blocked = guardPublicRequest(event); if (blocked) return blocked;
 *   … call a query … return publicJson(data, { request });
 */
import crypto from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

const DEV_MARKETING_ORIGIN = 'http://localhost:4321';
const SUCCESS_CACHE_CONTROL = 'public, s-maxage=120, stale-while-revalidate=600';
const ERROR_CACHE_CONTROL = 'no-store';

/** Off unless explicitly 'true' — in every environment, dev included. */
export function isPublicJobBoardEnabled(): boolean {
	return publicEnv.PUBLIC_JOB_BOARD_ENABLED === 'true';
}

export function allowedOrigin(): string | null {
	const configured = publicEnv.PUBLIC_MARKETING_URL?.trim();
	if (configured) return configured.replace(/\/+$/, '');
	return dev ? DEV_MARKETING_ORIGIN : null;
}

/**
 * CORS for the marketing site only. Server-to-server fetches send no Origin
 * and don't need it. No credentials: responses are identical for everyone.
 * `Vary: Origin` is always set because the responses are publicly cacheable.
 */
function corsHeaders(request: Request): Headers {
	const headers = new Headers({ Vary: 'Origin' });
	const origin = request.headers.get('origin');
	const allowed = allowedOrigin();
	if (origin && allowed && origin === allowed) {
		headers.set('Access-Control-Allow-Origin', allowed);
	}
	return headers;
}

export function publicJson(
	data: unknown,
	init: { request: Request; status?: number; headers?: Record<string, string> }
): Response {
	const status = init.status ?? 200;
	const headers = corsHeaders(init.request);
	headers.set('Content-Type', 'application/json');
	headers.set('Cache-Control', status < 400 ? SUCCESS_CACHE_CONTROL : ERROR_CACHE_CONTROL);
	for (const [key, value] of Object.entries(init.headers ?? {})) headers.set(key, value);
	return new Response(JSON.stringify(data), { status, headers });
}

export function publicError(
	request: Request,
	status: number,
	body: Record<string, unknown> = {},
	headers?: Record<string, string>
): Response {
	return publicJson({ error: true, ...body }, { request, status, headers });
}

export function corsPreflight(request: Request): Response {
	if (!isPublicJobBoardEnabled()) return publicError(request, 404, { message: 'Not found' });
	const headers = corsHeaders(request);
	headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
	headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
	headers.set('Access-Control-Max-Age', '600');
	return new Response(null, { status: 204, headers });
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * In-memory token bucket, ~60 requests/minute per IP with a burst of 60.
 *
 * PER-PROCESS: the buckets live in this Node process's memory, so the limit is
 * only accurate while the web service runs a single replica. With N replicas
 * the effective limit becomes up to N × 60/min. Move it to Redis (or the edge)
 * before scaling out.
 */
const BUCKET_CAPACITY = 60;
const REFILL_PER_MS = 60 / 60_000;
const MAX_TRACKED_IPS = 10_000;

type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();

export function takeToken(
	key: string,
	now = Date.now()
): { ok: true } | { ok: false; retryAfterSeconds: number } {
	if (buckets.size > MAX_TRACKED_IPS) {
		// Drop buckets that have fully refilled — they carry no state worth keeping.
		for (const [k, b] of buckets) {
			if (b.tokens + (now - b.updatedAt) * REFILL_PER_MS >= BUCKET_CAPACITY) buckets.delete(k);
		}
	}

	const bucket = buckets.get(key) ?? { tokens: BUCKET_CAPACITY, updatedAt: now };
	bucket.tokens = Math.min(
		BUCKET_CAPACITY,
		bucket.tokens + (now - bucket.updatedAt) * REFILL_PER_MS
	);
	bucket.updatedAt = now;

	if (bucket.tokens < 1) {
		buckets.set(key, bucket);
		return { ok: false, retryAfterSeconds: Math.ceil((1 - bucket.tokens) / REFILL_PER_MS / 1000) };
	}
	bucket.tokens -= 1;
	buckets.set(key, bucket);
	return { ok: true };
}

/** Test seam. */
export function resetRateLimits() {
	buckets.clear();
}

export function clientIp(event: Pick<RequestEvent, 'request' | 'getClientAddress'>): string {
	const forwarded = event.request.headers.get('x-forwarded-for');
	const first = forwarded?.split(',')[0]?.trim();
	if (first) return first;
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

/**
 * The marketing site's SSR server fetches from ONE IP on behalf of every
 * visitor, so it would exhaust a per-IP bucket on its own. When
 * JOB_BOARD_SERVER_KEY is set, a request carrying it in `x-job-board-key`
 * skips the limiter. Unset → nobody skips.
 */
function isTrustedServer(request: Request): boolean {
	const expected = privateEnv.JOB_BOARD_SERVER_KEY;
	const provided = request.headers.get('x-job-board-key');
	if (!expected || !provided) return false;
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Kill switch + rate limit. Returns a response to send, or null to proceed. */
export function guardPublicRequest(
	event: Pick<RequestEvent, 'request' | 'getClientAddress'>
): Response | null {
	if (!isPublicJobBoardEnabled()) {
		return publicError(event.request, 404, { message: 'Not found' });
	}
	if (isTrustedServer(event.request)) return null;

	const result = takeToken(clientIp(event));
	if (!result.ok) {
		return publicError(
			event.request,
			429,
			{ message: 'Too many requests' },
			{ 'Retry-After': String(result.retryAfterSeconds) }
		);
	}
	return null;
}
