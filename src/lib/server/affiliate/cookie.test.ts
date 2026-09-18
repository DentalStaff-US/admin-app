import { describe, it, expect } from 'vitest';
import {
	serializeRefCookie,
	parseRefCookie,
	refCookieOptions,
	shouldOverwriteRefCookie,
	REF_COOKIE_NAME,
	REF_COOKIE_MAX_AGE
} from '$lib/server/affiliate/cookie';

const NOW = new Date('2026-06-01T12:00:00Z');
const TOUCH = new Date('2026-05-15T09:30:00Z');

describe('serialize / parse round-trip', () => {
	it('round-trips a value', () => {
		const raw = serializeRefCookie({ code: 'ABCD2345', firstTouchAt: TOUCH });
		expect(parseRefCookie(raw, NOW)).toEqual({ code: 'ABCD2345', firstTouchAt: TOUCH });
	});

	it('normalises casing on the way in', () => {
		const raw = serializeRefCookie({ code: 'abcd2345', firstTouchAt: TOUCH });
		expect(raw.startsWith('ABCD2345|')).toBe(true);
	});

	it('uses a simple delimited pair the Astro inline script can write', () => {
		expect(serializeRefCookie({ code: 'ABCD2345', firstTouchAt: TOUCH })).toBe(
			`ABCD2345|${TOUCH.toISOString()}`
		);
	});
});

describe('parseRefCookie — fails closed', () => {
	it('returns null for missing input', () => {
		expect(parseRefCookie(null, NOW)).toBeNull();
		expect(parseRefCookie(undefined, NOW)).toBeNull();
		expect(parseRefCookie('', NOW)).toBeNull();
	});

	it('returns null for a malformed value', () => {
		// A broken cookie must never attribute revenue to an arbitrary affiliate.
		for (const bad of ['ABCD2345', 'ABCD2345|', '|2026-01-01', 'a|b|c', 'garbage']) {
			expect(parseRefCookie(bad, NOW)).toBeNull();
		}
	});

	it('returns null for an invalid code', () => {
		expect(parseRefCookie(`AD MIN|${TOUCH.toISOString()}`, NOW)).toBeNull();
		expect(parseRefCookie(`ADMIN|${TOUCH.toISOString()}`, NOW)).toBeNull();
	});

	it('returns null for an unparseable date', () => {
		expect(parseRefCookie('ABCD2345|not-a-date', NOW)).toBeNull();
	});

	it('returns null once the 90-day window has elapsed', () => {
		const old = new Date(NOW.getTime() - (REF_COOKIE_MAX_AGE + 1) * 1000);
		expect(parseRefCookie(`ABCD2345|${old.toISOString()}`, NOW)).toBeNull();
	});

	it('still accepts a value just inside the window', () => {
		const justInside = new Date(NOW.getTime() - (REF_COOKIE_MAX_AGE - 60) * 1000);
		expect(parseRefCookie(`ABCD2345|${justInside.toISOString()}`, NOW)).not.toBeNull();
	});

	it('rejects a first-touch timestamp in the future (tampered or skewed clock)', () => {
		const future = new Date(NOW.getTime() + 60_000);
		expect(parseRefCookie(`ABCD2345|${future.toISOString()}`, NOW)).toBeNull();
	});
});

describe('refCookieOptions', () => {
	it('omits the domain in dev so localhost ports share it by hostname', () => {
		const opts = refCookieOptions({ cookieDomain: null, secure: false });
		expect(opts.domain).toBeUndefined();
		expect(opts.secure).toBe(false);
	});

	it('sets the shared parent domain in production', () => {
		const opts = refCookieOptions({ cookieDomain: '.dtstaffingsolutions.com', secure: true });
		expect(opts.domain).toBe('.dtstaffingsolutions.com');
		expect(opts.secure).toBe(true);
	});

	it('is not HttpOnly — the static Astro site can only set it via document.cookie', () => {
		expect(refCookieOptions({ secure: true }).httpOnly).toBe(false);
	});

	it('uses SameSite=Lax so the cookie survives a cross-site link click', () => {
		expect(refCookieOptions({ secure: true }).sameSite).toBe('lax');
	});

	it('defaults to the 90-day lifetime', () => {
		expect(refCookieOptions({ secure: true }).maxAge).toBe(REF_COOKIE_MAX_AGE);
	});
});

describe('shouldOverwriteRefCookie — first-touch wins', () => {
	const existing = { code: 'FIRST234', firstTouchAt: TOUCH };

	it('writes when nothing is stored', () => {
		expect(shouldOverwriteRefCookie(null, 'ABCD2345')).toBe(true);
	});

	it('does NOT overwrite an existing attribution', () => {
		// Where a school and an influencer both touch the same student, credit
		// goes to whoever created the relationship.
		expect(shouldOverwriteRefCookie(existing, 'ABCD2345')).toBe(false);
	});

	it('overwrites under an explicit last-touch model', () => {
		expect(shouldOverwriteRefCookie(existing, 'ABCD2345', 'LAST_TOUCH')).toBe(true);
	});

	it('never writes an invalid incoming code', () => {
		expect(shouldOverwriteRefCookie(null, 'ADMIN')).toBe(false);
		expect(shouldOverwriteRefCookie(null, '')).toBe(false);
	});
});

describe('cookie name', () => {
	it('is the shared name all four properties agree on', () => {
		expect(REF_COOKIE_NAME).toBe('dtss_ref');
	});
});
