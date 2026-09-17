/**
 * Referral resolution at signup — the glue between the cookie, the DB, and the
 * pure `decideAttribution` decision.
 *
 * Returns a DECISION, not a write. The caller performs the write, so the admin
 * app can do it inside the same transaction that patches role/verified (making
 * "fully set up and attributed, or neither" atomic), while the candidate app
 * calls it over the external API.
 */
import { parseRefCookie } from '$lib/server/affiliate/cookie';
import { decideAttribution, type AttributionDecision } from '$lib/server/affiliate/attribution';
import { resolveCode, hasReferral } from '$lib/server/database/queries/affiliates';
import { logger } from '$lib/server/logger';

export async function resolveReferralForSignup(input: {
	cookieValue: string | null | undefined;
	urlCode: string | null;
	hasInvite: boolean;
	signupUserId: string;
	signupEmail: string;
	signupRole: string;
}): Promise<AttributionDecision> {
	try {
		const cookie = parseRefCookie(input.cookieValue);
		const code = cookie?.code ?? input.urlCode ?? null;

		if (!code) return { action: 'SKIP', reason: 'NO_REFERRAL_CODE' };

		const resolved = await resolveCode(code);
		const alreadyAttributed = await hasReferral(input.signupUserId);

		return decideAttribution({
			cookieCode: cookie?.code ?? null,
			urlCode: input.urlCode,
			firstTouchAt: cookie?.firstTouchAt ?? null,
			clickId: null,
			hasInvite: input.hasInvite,
			affiliate: resolved?.affiliate ?? null,
			code: resolved?.code ?? null,
			alreadyAttributed,
			signupUserId: input.signupUserId,
			signupEmail: input.signupEmail,
			signupRole: input.signupRole
		});
	} catch (err) {
		// A broken referral must never block a signup.
		logger.error('affiliate referral resolution failed at signup', {
			error: err,
			userId: input.signupUserId
		});
		return { action: 'SKIP', reason: 'RESOLUTION_ERROR' };
	}
}
