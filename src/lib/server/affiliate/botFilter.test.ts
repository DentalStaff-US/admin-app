import { describe, it, expect } from 'vitest';
import {
	classifyClick,
	isDuplicateClick,
	CLICK_DEDUPE_WINDOW_MS
} from '$lib/server/affiliate/botFilter';

const CHROME =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAFARI_IOS =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

describe('classifyClick — real browsers are never flagged', () => {
	for (const [name, ua] of [
		['desktop Chrome', CHROME],
		['iOS Safari', SAFARI_IOS],
		['Android Chrome', ANDROID]
	] as const) {
		it(`does not flag ${name}`, () => {
			expect(classifyClick({ userAgent: ua, method: 'GET', secFetchMode: 'navigate' })).toEqual({
				isBot: false
			});
		});
	}

	it('does not flag a browser that omits sec-fetch-mode', () => {
		// Older browsers and some in-app webviews do not send Fetch Metadata.
		// Absence alone is not enough to call something a bot.
		expect(classifyClick({ userAgent: CHROME, method: 'GET' }).isBot).toBe(false);
	});
});

describe('classifyClick — bots and previewers are flagged', () => {
	const BOTS: Array<[string, string]> = [
		['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
		['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
		['facebook unfurler', 'facebookexternalhit/1.1'],
		['Slack unfurler', 'Slackbot-LinkExpanding 1.0'],
		['Twitterbot', 'Twitterbot/1.0'],
		['LinkedIn', 'LinkedInBot/1.0'],
		['WhatsApp', 'WhatsApp/2.19.81 A'],
		['Discord', 'Mozilla/5.0 (compatible; Discordbot/2.0)'],
		['curl', 'curl/8.4.0'],
		['wget', 'Wget/1.21.3'],
		['python', 'python-requests/2.31.0'],
		['headless Chrome', 'Mozilla/5.0 HeadlessChrome/120.0.0.0'],
		['Puppeteer', 'Mozilla/5.0 puppeteer'],
		['uptime monitor', 'Pingdom.com_bot_version_1.4']
	];

	for (const [name, ua] of BOTS) {
		it(`flags ${name}`, () => {
			const result = classifyClick({ userAgent: ua, method: 'GET', secFetchMode: 'navigate' });
			expect(result.isBot).toBe(true);
			expect(result.reason).toBeTruthy();
		});
	}

	it('flags an empty or missing user agent', () => {
		expect(classifyClick({ userAgent: '' })).toEqual({
			isBot: true,
			reason: 'EMPTY_USER_AGENT'
		});
		expect(classifyClick({ userAgent: null })).toMatchObject({ reason: 'EMPTY_USER_AGENT' });
		expect(classifyClick({})).toMatchObject({ reason: 'EMPTY_USER_AGENT' });
		expect(classifyClick({ userAgent: '   ' })).toMatchObject({ reason: 'EMPTY_USER_AGENT' });
	});

	it('flags a HEAD request — never a human following a link', () => {
		expect(classifyClick({ userAgent: CHROME, method: 'HEAD' })).toEqual({
			isBot: true,
			reason: 'HEAD_REQUEST'
		});
	});

	it('is case-insensitive about the method', () => {
		expect(classifyClick({ userAgent: CHROME, method: 'head' }).isBot).toBe(true);
	});

	it('flags a non-navigate sec-fetch-mode on a link hit', () => {
		const result = classifyClick({
			userAgent: CHROME,
			method: 'GET',
			secFetchMode: 'cors'
		});
		expect(result).toEqual({ isBot: true, reason: 'SEC_FETCH_MODE_CORS' });
	});

	it('is case-insensitive about the user agent', () => {
		expect(classifyClick({ userAgent: 'GOOGLEBOT/2.1' }).isBot).toBe(true);
	});
});

describe('isDuplicateClick — 30 minute window', () => {
	const now = new Date('2026-06-01T12:00:00Z');

	it('is not a duplicate when nothing was seen before', () => {
		expect(isDuplicateClick(null, now)).toBe(false);
		expect(isDuplicateClick(undefined, now)).toBe(false);
	});

	it('is a duplicate inside the window', () => {
		const recent = new Date(now.getTime() - 5 * 60 * 1000);
		expect(isDuplicateClick(recent, now)).toBe(true);
	});

	it('is not a duplicate once the window has passed', () => {
		const old = new Date(now.getTime() - CLICK_DEDUPE_WINDOW_MS - 1);
		expect(isDuplicateClick(old, now)).toBe(false);
	});

	it('treats exactly the window boundary as expired', () => {
		const boundary = new Date(now.getTime() - CLICK_DEDUPE_WINDOW_MS);
		expect(isDuplicateClick(boundary, now)).toBe(false);
	});

	it('honours a custom window', () => {
		const oneMinAgo = new Date(now.getTime() - 60_000);
		expect(isDuplicateClick(oneMinAgo, now, 30_000)).toBe(false);
		expect(isDuplicateClick(oneMinAgo, now, 120_000)).toBe(true);
	});
});
