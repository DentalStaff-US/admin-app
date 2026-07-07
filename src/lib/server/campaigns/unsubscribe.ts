import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';

// Stateless email unsubscribe tokens. We HMAC the userId so the /unsubscribe
// route can flip receive_email without storing a per-user token. Reuses
// JWT_SECRET (falls back to CRON_SECRET) as the signing key.
function secret(): string {
	return env.JWT_SECRET || env.CRON_SECRET || 'dev-unsubscribe-secret';
}

export function signUnsubscribe(userId: string): string {
	return crypto.createHmac('sha256', secret()).update(`unsub.${userId}`).digest('hex');
}

export function verifyUnsubscribe(userId: string, token: string | null | undefined): boolean {
	if (!token) return false;
	const expected = signUnsubscribe(userId);
	const a = Buffer.from(token, 'hex');
	const b = Buffer.from(expected, 'hex');
	if (a.length === 0 || a.length !== b.length) return false;
	return crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId: string): string {
	const base = (env.BASE_URL || '').replace(/\/$/, '');
	return `${base}/unsubscribe?u=${encodeURIComponent(userId)}&t=${signUnsubscribe(userId)}`;
}
