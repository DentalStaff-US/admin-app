import { dev, browser } from '$app/environment';
import posthog from 'posthog-js';

const SOURCE = 'admin' as const;

export type LogProps = Record<string, unknown> & {
	error?: unknown;
};

function extractError(error: unknown): { error_message?: string; error_stack?: string } {
	if (!error) return {};
	if (error instanceof Error) {
		return { error_message: error.message, error_stack: error.stack };
	}
	return { error_message: String(error) };
}

function basePayload(props: LogProps | undefined) {
	const { error, ...rest } = props ?? {};
	return { source: SOURCE, ...extractError(error), ...rest };
}

export const logger = {
	error(message: string, props?: LogProps): void {
		if (dev || !browser) {
			console.error(`[${SOURCE}] ${message}`, props?.error ?? '', props ?? '');
			return;
		}
		try {
			if (props?.error instanceof Error) posthog.captureException(props.error);
			posthog.capture('client_error', { message, ...basePayload(props) });
		} catch (e) {
			console.error(`[${SOURCE}] logger.error fallback`, message, e);
		}
	},

	warn(message: string, props?: LogProps): void {
		if (dev) console.warn(`[${SOURCE}] ${message}`, props ?? '');
	},

	event(eventName: string, props?: LogProps): void {
		if (dev || !browser) {
			console.log(`[${SOURCE}] event:${eventName}`, props ?? '');
			return;
		}
		try {
			posthog.capture(eventName, basePayload(props));
		} catch (e) {
			console.error(`[${SOURCE}] logger.event fallback`, eventName, e);
		}
	},

	info(message: string, props?: LogProps): void {
		if (dev) console.log(`[${SOURCE}] ${message}`, props ?? '');
	}
};
