import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { verifyDocumensoSecret } from '$lib/server/signatures/webhookAuth';
import { handleDocumensoEvent } from '$lib/server/signatures/service';
import { logger } from '$lib/server/logger';

/**
 * Documenso webhook receiver. Bypasses session handling in hooks.server.ts.
 *
 * Documenso authenticates with a shared secret sent verbatim in
 * `X-Documenso-Secret` (not an HMAC of the body). That's enough here because we
 * never act on the body's contents: the event only tells us which envelope to
 * re-read, and `handleDocumensoEvent` takes the state from Documenso's API.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!verifyDocumensoSecret(request.headers.get('x-documenso-secret'), env.DOCUMENSO_WEBHOOK_SECRET)) {
		return new Response('Unauthorized', { status: 401 });
	}

	let body: Parameters<typeof handleDocumensoEvent>[0];
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

	try {
		const result = await handleDocumensoEvent(body);
		logger.event('documenso_webhook_received', { event: body.event, ...result });
		return json({ received: true, ...result });
	} catch (error) {
		// 500 so the failure is visible in Documenso's webhook log. Nothing is lost
		// either way: the daily sweep re-syncs every open request.
		logger.error('documenso webhook failed', { error, event: body.event });
		return new Response('Internal Server Error', { status: 500 });
	}
};
