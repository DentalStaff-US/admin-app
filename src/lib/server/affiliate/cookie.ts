/**
 * The `dtss_ref` attribution cookie. Pure and dependency-free.
 *
 * All four properties are subdomains of one registrable domain
 * (www / internal / app / partners .dtstaffingsolutions.com), which is not on
 * the Public Suffix List — so ONE cookie scoped to `.dtstaffingsolutions.com` is
 * readable everywhere and there is no cross-domain bridge to build.
 *
 * The cookie is deliberately NOT HttpOnly: the static Astro marketing site can
 * only set it via document.cookie. That is safe because a referral code is not a
 * secret — the entire point is that anyone can put it in a URL, and forging the
 * cookie achieves exactly what clicking a referral link achieves. ALL security
 * lives at consume time, server-side (code exists, is active, belongs to an
 * ACTIVE affiliate, passes the self-referral guard).
 */
import { normalizeCode, validateCode } from '$lib/server/affiliate/code';

export const REF_COOKIE_NAME = 'dtss_ref';

/** 90 days, in seconds. */
export const REF_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

export type RefCookieValue = {
	code: string;
	firstTouchAt: Date;
};

/**
 * Serialise as `CODE|ISO8601`. A flat delimited pair rather than JSON so the
 * Astro inline script can write the identical format in a couple of lines
 * without a serialiser, and so the value needs no URL-encoding.
 */
export function serializeRefCookie(value: RefCookieValue): string {
	return `${normalizeCode(value.code)}|${value.firstTouchAt.toISOString()}`;
}

/**
 * Parse, failing CLOSED: anything malformed, expired or invalid yields null,
 * which the attribution decision treats as "no referral". A broken cookie must
 * never attribute revenue to an arbitrary affiliate.
 */
export function parseRefCookie(
	raw: string | null | undefined,
	now: Date = new Date(),
	maxAgeSeconds: number = REF_COOKIE_MAX_AGE
): RefCookieValue | null {
	if (!raw) return null;

	const parts = raw.split('|');
	if (parts.length !== 2) return null;

	const [rawCode, rawDate] = parts;
	if (!validateCode(rawCode).ok) return null;

	const firstTouchAt = new Date(rawDate);
	if (Number.isNaN(firstTouchAt.getTime())) return null;

	// A first-touch timestamp in the future is nonsense — a tampered or
	// clock-skewed cookie. Reject rather than granting an unbounded window.
	if (firstTouchAt.getTime() > now.getTime()) return null;

	const ageSeconds = (now.getTime() - firstTouchAt.getTime()) / 1000;
	if (ageSeconds > maxAgeSeconds) return null;

	return { code: normalizeCode(rawCode), firstTouchAt };
}

export type RefCookieOptions = {
	path: string;
	maxAge: number;
	sameSite: 'lax';
	httpOnly: false;
	secure: boolean;
	domain?: string;
};

/**
 * Cookie attributes. `cookieDomain` comes from PUBLIC_COOKIE_DOMAIN and is left
 * unset in dev, where localhost:3000 / :5173 / :4321 already share cookies by
 * hostname (cookies ignore the port).
 */
export function refCookieOptions(opts: {
	cookieDomain?: string | null;
	secure: boolean;
	maxAge?: number;
}): RefCookieOptions {
	const base: RefCookieOptions = {
		path: '/',
		maxAge: opts.maxAge ?? REF_COOKIE_MAX_AGE,
		sameSite: 'lax',
		httpOnly: false,
		secure: opts.secure
	};
	if (opts.cookieDomain) base.domain = opts.cookieDomain;
	return base;
}

export type AttributionModel = 'FIRST_TOUCH' | 'LAST_TOUCH';

/**
 * Whether an incoming `?ref=` should overwrite what is already stored.
 *
 * FIRST_TOUCH (the configured default): an existing valid cookie always wins.
 * Where a dental school and an influencer both touch the same student, this
 * rewards whoever created the relationship, and removes the incentive to buy
 * branded-search last-click.
 */
export function shouldOverwriteRefCookie(
	existing: RefCookieValue | null,
	incomingCode: string,
	model: AttributionModel = 'FIRST_TOUCH'
): boolean {
	if (!validateCode(incomingCode).ok) return false;
	if (!existing) return true;
	if (model === 'LAST_TOUCH') return true;
	return false;
}
