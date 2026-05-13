import { dev } from '$app/environment';
import { getPostHogClient } from '$lib/server/posthog';

const SOURCE = 'admin' as const;

export type LogProps = Record<string, unknown> & {
	error?: unknown;
	distinctId?: string;
};

function extractError(error: unknown): { error_message?: string; error_stack?: string } {
	if (!error) return {};
	if (error instanceof Error) {
		return { error_message: error.message, error_stack: error.stack };
	}
	return { error_message: String(error) };
}

function basePayload(props: LogProps | undefined) {
	const { error, distinctId: _distinctId, ...rest } = props ?? {};
	return { source: SOURCE, ...extractError(error), ...rest };
}

export const logger = {
	error(message: string, props?: LogProps): void {
		if (dev) {
			console.error(`[${SOURCE}] ${message}`, props?.error ?? '', props ?? '');
			return;
		}
		try {
			getPostHogClient().capture({
				distinctId: props?.distinctId ?? 'server',
				event: 'server_error',
				properties: { message, ...basePayload(props) }
			});
		} catch (e) {
			console.error(`[${SOURCE}] logger.error fallback`, message, e);
		}
	},

	warn(message: string, props?: LogProps): void {
		if (dev) console.warn(`[${SOURCE}] ${message}`, props ?? '');
		// warns are dev-only by default; not captured to PostHog.
	},

	event(eventName: string, props?: LogProps): void {
		if (dev) {
			console.log(`[${SOURCE}] event:${eventName}`, props ?? '');
			return;
		}
		try {
			getPostHogClient().capture({
				distinctId: props?.distinctId ?? 'server',
				event: eventName,
				properties: basePayload(props)
			});
		} catch (e) {
			console.error(`[${SOURCE}] logger.event fallback`, eventName, e);
		}
	},

	info(message: string, props?: LogProps): void {
		if (dev) console.log(`[${SOURCE}] ${message}`, props ?? '');
		// info is dev-only.
	}
};
