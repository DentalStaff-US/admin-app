/**
 * The attribution decision. Pure and dependency-free.
 *
 * Split deliberately into a pure `decideAttribution` (all the branching, fully
 * unit-testable with zero mocking) and a thin impure `applyAttribution` (in
 * queries/affiliates.ts) that just executes the decision. Same shape as
 * jobs/sign.ts.
 *
 * SECURITY NOTE: every guard here runs server-side at CONSUME time. The cookie
 * itself is untrusted and non-HttpOnly by design — forging it only achieves what
 * clicking a referral link achieves.
 */

export type AttributionInput = {
	/** Code from a valid, unexpired dtss_ref cookie, if any. */
	cookieCode: string | null;
	/** Code from `?ref=` on the signup request itself, if any. */
	urlCode: string | null;
	firstTouchAt: Date | null;
	clickId: number | null;

	/**
	 * An explicit invite (staff_invite / admin_invite) present on this signup.
	 * An invite always OUTRANKS a referral cookie — someone invited by their
	 * office manager is not an influencer's lead.
	 */
	hasInvite: boolean;

	/** The affiliate that owns the code, as loaded from the DB. Null = unknown code. */
	affiliate: {
		id: string;
		userId: string;
		status: 'PENDING' | 'ACTIVE' | 'ON_HOLD' | 'DENIED';
		contactEmail: string | null;
		/** The affiliate owner's login email. */
		ownerEmail: string | null;
	} | null;

	/** The referral code row itself. Null = unknown code. */
	code: { id: string; active: boolean } | null;

	/** Whether this user already has a referral row — referrals are permanent. */
	alreadyAttributed: boolean;

	/** The user signing up. */
	signupUserId: string;
	signupEmail: string;
	signupRole: string;
};

export type AttributionDecision =
	| {
			action: 'CREATE';
			affiliateId: string;
			codeId: string;
			source: 'COOKIE' | 'URL';
			firstTouchAt: Date | null;
			clickId: number | null;
			/** Set when a statistical heuristic fired — creates as PENDING for review. */
			flaggedReason?: string;
			status: 'QUALIFIED' | 'PENDING';
	  }
	| {
			/** Recorded as a REJECTED row so it is visible in the dashboard, not vanished. */
			action: 'REJECT';
			affiliateId: string;
			codeId: string | null;
			reason: string;
	  }
	| { action: 'SKIP'; reason: string };

/**
 * Decide what to do with a referral at signup.
 *
 * Order matters: cheap structural checks first, identity checks before
 * statistical ones, and "already attributed" before anything that would write.
 */
export function decideAttribution(input: AttributionInput): AttributionDecision {
	// A referral is permanent. Never overwrite, never duplicate. This is also
	// enforced by UNIQUE(referred_user_id) — this branch just avoids the churn.
	if (input.alreadyAttributed) {
		return { action: 'SKIP', reason: 'ALREADY_ATTRIBUTED' };
	}

	// Prefer the cookie (first touch) over a URL param on the signup request.
	const source: 'COOKIE' | 'URL' | null = input.cookieCode
		? 'COOKIE'
		: input.urlCode
			? 'URL'
			: null;
	const code = input.cookieCode ?? input.urlCode;

	if (!code || !source) {
		return { action: 'SKIP', reason: 'NO_REFERRAL_CODE' };
	}

	if (!input.affiliate || !input.code) {
		return { action: 'SKIP', reason: 'UNKNOWN_CODE' };
	}

	// An explicit invite outranks a referral cookie — but record the loss rather
	// than discarding it silently, so support can explain it later.
	if (input.hasInvite) {
		return {
			action: 'REJECT',
			affiliateId: input.affiliate.id,
			codeId: input.code.id,
			reason: 'SUPERSEDED_BY_INVITE'
		};
	}

	// --- Hard rejects: identity equality only -------------------------------
	if (input.affiliate.userId === input.signupUserId) {
		return {
			action: 'REJECT',
			affiliateId: input.affiliate.id,
			codeId: input.code.id,
			reason: 'SELF_REFERRAL_SAME_USER'
		};
	}

	const signupEmail = normalizeEmail(input.signupEmail);
	const affiliateEmails = [input.affiliate.ownerEmail, input.affiliate.contactEmail]
		.filter((e): e is string => !!e)
		.map(normalizeEmail);

	if (affiliateEmails.includes(signupEmail)) {
		return {
			action: 'REJECT',
			affiliateId: input.affiliate.id,
			codeId: input.code.id,
			reason: 'SELF_REFERRAL_SAME_EMAIL'
		};
	}

	// --- Affiliate/code state ------------------------------------------------
	if (!input.code.active) {
		return {
			action: 'REJECT',
			affiliateId: input.affiliate.id,
			codeId: input.code.id,
			reason: 'CODE_INACTIVE'
		};
	}

	if (input.affiliate.status !== 'ACTIVE') {
		return {
			action: 'REJECT',
			affiliateId: input.affiliate.id,
			codeId: input.code.id,
			reason: `AFFILIATE_${input.affiliate.status}`
		};
	}

	// --- Statistical signals: flag for a human, never auto-reject -----------
	// Auto-rejecting a dental school because two students shared campus wifi
	// would be a support disaster.
	const flaggedReason = detectSuspicion(input, signupEmail, affiliateEmails);

	return {
		action: 'CREATE',
		affiliateId: input.affiliate.id,
		codeId: input.code.id,
		source,
		firstTouchAt: input.firstTouchAt,
		clickId: input.clickId,
		...(flaggedReason ? { flaggedReason } : {}),
		status: flaggedReason ? 'PENDING' : 'QUALIFIED'
	};
}

/**
 * Soft fraud signals. Returns a reason to FLAG (creating the referral as
 * PENDING for admin review), never a reason to reject.
 */
function detectSuspicion(
	input: AttributionInput,
	signupEmail: string,
	affiliateEmails: string[]
): string | undefined {
	// `user+tag@domain` aliasing of one of the affiliate's own addresses.
	const signupBase = stripPlusAlias(signupEmail);
	for (const affEmail of affiliateEmails) {
		if (stripPlusAlias(affEmail) === signupBase) return 'EMAIL_PLUS_ALIAS_MATCH';
	}
	return undefined;
}

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

/** `a+tag@b.com` -> `a@b.com`. Leaves everything else untouched. */
export function stripPlusAlias(email: string): string {
	const at = email.lastIndexOf('@');
	if (at <= 0) return email;
	const local = email.slice(0, at);
	const domain = email.slice(at);
	const plus = local.indexOf('+');
	return plus === -1 ? email : local.slice(0, plus) + domain;
}
