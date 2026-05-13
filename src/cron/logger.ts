import { PostHog } from 'posthog-node';

const SOURCE = 'cron' as const;
const isDev = process.env.NODE_ENV !== 'production';

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
	if (isDev) return null;
	if (!process.env.PUBLIC_POSTHOG_PROJECT_TOKEN || !process.env.PUBLIC_POSTHOG_HOST) return null;
	if (!posthogClient) {
		posthogClient = new PostHog(process.env.PUBLIC_POSTHOG_PROJECT_TOKEN, {
			host: process.env.PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0
		});
	}
	return posthogClient;
}

export async function shutdownPostHog(): Promise<void> {
	if (posthogClient) await posthogClient.shutdown();
}

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
		if (isDev) {
			console.error(`[${SOURCE}] ${message}`, props?.error ?? '', props ?? '');
			return;
		}
		const client = getPostHogClient();
		if (!client) {
			console.error(`[${SOURCE}] ${message}`, props?.error ?? '');
			return;
		}
		try {
			client.capture({
				distinctId: props?.distinctId ?? 'cron',
				event: 'server_error',
				properties: { message, ...basePayload(props) }
			});
		} catch (e) {
			console.error(`[${SOURCE}] logger.error fallback`, message, e);
		}
	},

	warn(message: string, props?: LogProps): void {
		if (isDev) console.warn(`[${SOURCE}] ${message}`, props ?? '');
	},

	event(eventName: string, props?: LogProps): void {
		if (isDev) {
			console.log(`[${SOURCE}] event:${eventName}`, props ?? '');
			return;
		}
		const client = getPostHogClient();
		if (!client) {
			console.log(`[${SOURCE}] event:${eventName}`, props ?? '');
			return;
		}
		try {
			client.capture({
				distinctId: props?.distinctId ?? 'cron',
				event: eventName,
				properties: basePayload(props)
			});
		} catch (e) {
			console.error(`[${SOURCE}] logger.event fallback`, eventName, e);
		}
	},

	info(message: string, props?: LogProps): void {
		if (isDev) console.log(`[${SOURCE}] ${message}`, props ?? '');
	}
};
