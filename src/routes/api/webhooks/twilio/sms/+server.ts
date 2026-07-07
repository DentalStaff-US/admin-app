import { type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import twilio from 'twilio';
import { env } from '$env/dynamic/private';
import db from '$lib/server/database/drizzle';
import { normalizeUSPhone } from '$lib/_helpers/phone';
import { logger } from '$lib/server/logger';

// Keywords Twilio itself recognizes for A2P opt-out/opt-in. We mirror the state
// into users.receive_sms so our own audience queries exclude opted-out numbers.
const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);

const twiml = (body = '') =>
	new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
		headers: { 'content-type': 'text/xml' }
	});

export const POST: RequestHandler = async ({ request, url }) => {
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = String(v);

	// Validate the Twilio signature when an auth token is configured. Skipped only
	// if the token is unset (local dev) so testing doesn't require real signatures.
	const signature = request.headers.get('x-twilio-signature');
	if (env.TWILIO_AUTH_TOKEN && signature) {
		const valid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url.toString(), params);
		if (!valid) {
			logger.warn('twilio sms webhook: invalid signature');
			return new Response('Invalid signature', { status: 403 });
		}
	}

	const from = normalizeUSPhone(params.From);
	const keyword = (params.Body ?? '').trim().toUpperCase();
	if (!from || (!STOP_WORDS.has(keyword) && !START_WORDS.has(keyword))) {
		// Not an opt-out/opt-in message — acknowledge and ignore.
		return twiml();
	}

	const receiveSms = START_WORDS.has(keyword);
	try {
		await db.execute(sql`
			UPDATE users SET receive_sms = ${receiveSms}
			WHERE id IN (
				SELECT user_id FROM candidate_profiles WHERE cell_phone = ${from}
				UNION
				SELECT user_id FROM client_profiles WHERE cell_phone = ${from}
			)
		`);
		logger.info('twilio sms opt-out update', { from, keyword, receiveSms });
	} catch (error) {
		logger.error('twilio sms webhook failed to update receive_sms', { error, from });
	}

	return twiml();
};
