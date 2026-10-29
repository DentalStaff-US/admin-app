import { building, dev } from '$app/environment';
import { getPostHogClient } from '$lib/server/posthog';

const SOURCE = 'admin' as const;
const DEDUPE_MS = 60_000;

// Production safety net for the hundreds of raw console.* calls that predate
// `logger`. Svelte component scripts run during SSR, so a console.log in a
// .svelte file also lands in Railway's server logs. In prod: log/info/debug/
// warn/trace/table/dir are dropped, console.error is sent to PostHog as
// `server_error`. Only string and Error arguments are forwarded — object
// arguments are typically row dumps full of PII and are deliberately dropped.
// New code should still use `logger` from `$lib/server/logger`.
export function installConsoleGuard(): void {
	if (dev || building) return;

	const original = { error: console.error.bind(console) };
	const noop = () => {};
	console.log = noop;
	console.info = noop;
	console.debug = noop;
	console.warn = noop;
	console.trace = noop;
	console.table = noop;
	console.dir = noop;

	const lastSent = new Map<string, number>();

	console.error = (...args: unknown[]) => {
		const error = args.find((a): a is Error => a instanceof Error);
		const message =
			args
				.filter((a): a is string => typeof a === 'string')
				.join(' ')
				.trim() ||
			error?.message ||
			'console.error';

		// A failing dependency can call console.error on every request; one
		// event per distinct message per minute is enough to see it.
		const now = Date.now();
		const key = message.slice(0, 200);
		if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return;
		lastSent.set(key, now);
		if (lastSent.size > 500) lastSent.clear();

		try {
			getPostHogClient().capture({
				distinctId: 'server',
				event: 'server_error',
				properties: {
					source: SOURCE,
					via: 'console.error',
					message,
					error_message: error?.message,
					error_stack: error?.stack
				}
			});
		} catch (e) {
			original.error(`[${SOURCE}] console guard could not reach PostHog`, message, e);
		}
	};
}
