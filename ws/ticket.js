// @ts-nocheck
// Short-lived proof of who may open an inbox socket. A SvelteKit route issues it after
// checking the session; the socket server only has to verify the signature.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TICKET_TTL_MS = 60_000;

const sign = (payload, secret) =>
	createHmac('sha256', `inbox-socket:${secret}`).update(payload).digest('base64url');

export function createTicket(userId, secret, now = Date.now()) {
	const payload = Buffer.from(JSON.stringify({ userId, exp: now + TICKET_TTL_MS })).toString('base64url');
	return `${payload}.${sign(payload, secret)}`;
}

/** The user id, or null if the ticket is forged, malformed or expired. */
export function verifyTicket(ticket, secret, now = Date.now()) {
	const [payload, signature] = String(ticket ?? '').split('.');
	if (!payload || !signature) return null;
	const expected = Buffer.from(sign(payload, secret));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	try {
		const { userId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
		return typeof userId === 'string' && exp > now ? userId : null;
	} catch {
		return null;
	}
}
