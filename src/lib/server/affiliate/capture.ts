/**
 * Referral link capture (`?ref=`).
 *
 * Runs from hooks.server.ts on any request carrying a `ref` param — BEFORE
 * session resolution and well before the CANDIDATE eviction redirect, so a
 * logged-in professional who clicks a referral link on the admin app still gets
 * the cookie written before the 302 fires.
 *
 * MUST NEVER THROW. `handleError` turns an unhandled throw into a 500 for the
 * whole page, and attribution is never worth breaking a page load over.
 */
import { createHmac } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { dev } from '$app/environment';
import {
	REF_COOKIE_NAME,
	parseRefCookie,
	serializeRefCookie,
	refCookieOptions,
	shouldOverwriteRefCookie
} from '$lib/server/affiliate/cookie';
import { validateCode } from '$lib/server/affiliate/code';
import {
	classifyClick,
	isDuplicateClick,
	CLICK_DEDUPE_WINDOW_MS
} from '$lib/server/affiliate/botFilter';
import { hasUsableLink, type AffiliateStatus } from '$lib/server/affiliate/eligibility';
import { resolveCode, recordClick, findRecentClick } from '$lib/server/database/queries/affiliates';
import { logger } from '$lib/server/logger';

/**
 * HMAC rather than a raw IP. We only ever need to compare two visits, never to
 * recover an address. Falls back to a dev salt so local testing works
 * unconfigured.
 */
function hmac(value: string, slice?: number): string {
	const secret = privateEnv.AFFILIATE_IP_HASH_SECRET || privateEnv.CRON_SECRET || 'dtss-dev-salt';
	const digest = createHmac('sha256', secret).update(value).digest('hex');
	return slice ? digest.slice(0, slice) : digest;
}

/**
 * Undefined in dev (localhost ports already share cookies by hostname); set to
 * `.dtstaffingsolutions.com` in production so one cookie covers www / internal /
 * app / partners.
 */
function cookieDomain(): string | null {
	return publicEnv.PUBLIC_COOKIE_DOMAIN || null;
}

export async function captureReferral(event: RequestEvent): Promise<void> {
	const rawCode = event.url.searchParams.get('ref');
	if (!rawCode) return;
	if (!validateCode(rawCode).ok) return;

	const now = new Date();
	const existing = parseRefCookie(event.cookies.get(REF_COOKIE_NAME), now);

	// FIRST TOUCH WINS. Where a dental school and an influencer both touch the
	// same student, credit goes to whoever created the relationship — and there
	// is no incentive to buy branded-search last-click.
	if (shouldOverwriteRefCookie(existing, rawCode)) {
		event.cookies.set(
			REF_COOKIE_NAME,
			serializeRefCookie({ code: rawCode, firstTouchAt: now }),
			refCookieOptions({ cookieDomain: cookieDomain(), secure: !dev })
		);
	}

	// Log the click even when the cookie is NOT overwritten — the affiliate still
	// generated the visit and their dashboard should reflect it.
	await logClick(event, rawCode, now);
}

async function logClick(event: RequestEvent, rawCode: string, now: Date): Promise<void> {
	const resolved = await resolveCode(rawCode);
	if (!resolved) return; // unknown code — nothing to attribute a click to

	// A held or denied affiliate's link does not resolve, so do not credit clicks
	// to it either.
	if (!hasUsableLink(resolved.affiliate.status as AffiliateStatus)) return;

	const userAgent = event.request.headers.get('user-agent');
	const classification = classifyClick({
		userAgent,
		method: event.request.method,
		secFetchMode: event.request.headers.get('sec-fetch-mode')
	});

	const ip =
		event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? safeClientIp(event);
	const ipHash = ip ? hmac(ip) : null;
	const userAgentHash = userAgent ? hmac(userAgent, 32) : null;

	// Collapse rapid repeat hits (refreshes, prefetch) into one click.
	if (!classification.isBot) {
		const since = new Date(now.getTime() - CLICK_DEDUPE_WINDOW_MS);
		const lastSeen = await findRecentClick(resolved.code.id, ipHash, userAgentHash, since);
		if (isDuplicateClick(lastSeen, now)) return;
	}

	await recordClick({
		codeId: resolved.code.id,
		affiliateId: resolved.affiliate.id,
		ipHash,
		userAgentHash,
		userAgent,
		referer: event.request.headers.get('referer'),
		landingHost: event.url.host,
		landingPath: event.url.pathname,
		utmSource: event.url.searchParams.get('utm_source'),
		utmMedium: event.url.searchParams.get('utm_medium'),
		utmCampaign: event.url.searchParams.get('utm_campaign'),
		isBot: classification.isBot,
		botReason: classification.reason ?? null
	});
}

/** getClientAddress() throws when no adapter-provided address is available. */
function safeClientIp(event: RequestEvent): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}

/** Wrapper used by hooks. Swallows everything — attribution is best-effort. */
export async function captureReferralSafely(event: RequestEvent): Promise<void> {
	try {
		await captureReferral(event);
	} catch (err) {
		logger.error('affiliate referral capture failed', {
			error: err,
			path: event.url.pathname
		});
	}
}
