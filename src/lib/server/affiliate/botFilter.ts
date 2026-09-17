/**
 * Click bot classification. Pure and dependency-free.
 *
 * Bots are FLAGGED, never dropped. When an affiliate asks "I posted to 40k
 * followers, why does it say 12 clicks", we need to be able to answer "3,400 of
 * those were LinkedIn's link preview" — which is impossible if the rows are gone.
 */

const BOT_UA_PATTERN =
	/bot|crawler|spider|slurp|curl|wget|python-requests|headless|phantom|puppeteer|playwright|facebookexternalhit|slackbot|twitterbot|bingpreview|whatsapp|discordbot|telegrambot|linkedinbot|embedly|preview|monitor|uptime|pingdom|lighthouse|gtmetrix/i;

export type ClickClassification = { isBot: boolean; reason?: string };

export type ClickSignals = {
	userAgent?: string | null;
	method?: string | null;
	/** The `sec-fetch-mode` request header, when present. */
	secFetchMode?: string | null;
};

/**
 * Classify a referral-link hit.
 *
 * Conservative by design: we would rather under-flag (and count a few previews
 * as real) than over-flag and tell an affiliate their genuine traffic was fake.
 */
export function classifyClick(signals: ClickSignals): ClickClassification {
	const ua = (signals.userAgent ?? '').trim();

	// A browser always sends a User-Agent. Absence means a script or a scanner.
	if (ua.length === 0) return { isBot: true, reason: 'EMPTY_USER_AGENT' };

	if (BOT_UA_PATTERN.test(ua)) return { isBot: true, reason: 'BOT_USER_AGENT' };

	// HEAD is never a human following a link; it's a health check or a link
	// unfurler probing the URL.
	const method = (signals.method ?? 'GET').toUpperCase();
	if (method === 'HEAD') return { isBot: true, reason: 'HEAD_REQUEST' };

	// A real top-level navigation reports sec-fetch-mode: navigate. Anything that
	// explicitly says otherwise (cors/no-cors) on a link hit is a fetcher.
	// Absent header => older browser or a non-Fetch-Metadata client; not enough
	// on its own to flag.
	const mode = signals.secFetchMode?.toLowerCase();
	if (mode && mode !== 'navigate') {
		return { isBot: true, reason: `SEC_FETCH_MODE_${mode.toUpperCase()}` };
	}

	return { isBot: false };
}

/**
 * Whether a click is a duplicate of one already seen inside the dedupe window.
 * A window rather than a unique index, so the interval stays tunable.
 */
export const CLICK_DEDUPE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function isDuplicateClick(
	lastSeenAt: Date | null | undefined,
	now: Date,
	windowMs: number = CLICK_DEDUPE_WINDOW_MS
): boolean {
	if (!lastSeenAt) return false;
	return now.getTime() - lastSeenAt.getTime() < windowMs;
}
