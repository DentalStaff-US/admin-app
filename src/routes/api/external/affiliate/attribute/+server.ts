import { json, type RequestHandler } from '@sveltejs/kit';
import { authenticateUser } from '$lib/server/serverUtils';
import { resolveReferralForSignup } from '$lib/server/affiliate/signup';
import { applyAttribution } from '$lib/server/database/queries/affiliates';
import { logger } from '$lib/server/logger';

/**
 * Attribute a referral to the CALLING user, immediately after their signup in
 * the candidate app.
 *
 * SECURITY: `referredUserId` is derived from the JWT and NEVER from the body.
 * A caller can therefore only ever attribute *itself*, which makes this endpoint
 * structurally immune to attribution forgery — no new auth mechanism and no
 * shared admin secret required.
 *
 * Idempotent server-side via UNIQUE(referred_user_id), because the caller is an
 * HTTP request that can be retried.
 */
export const POST: RequestHandler = async ({ request }) => {
	const user = await authenticateUser(request);

	let body: { code?: string; referredRole?: string } = {};
	try {
		body = await request.json();
	} catch {
		// An empty body is legitimate — the cookie may carry the code instead.
	}

	const decision = await resolveReferralForSignup({
		cookieValue: null,
		urlCode: body.code ?? null,
		hasInvite: false,
		signupUserId: user.id,
		signupEmail: user.email,
		signupRole: body.referredRole ?? user.role ?? 'CANDIDATE'
	});

	const result = await applyAttribution(decision, {
		referredUserId: user.id,
		referredRole: body.referredRole ?? user.role ?? 'CANDIDATE'
	});

	logger.info('affiliate attribution attempted', {
		userId: user.id,
		action: decision.action,
		written: result.written
	});

	return json({ success: true, action: decision.action, written: result.written });
};
