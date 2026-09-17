/**
 * The affiliate summary shown on each app's SETTINGS page.
 *
 * Per the product decision, settings shows only two things — the affiliate's
 * status and their link. Earnings, referrals and payout history live exclusively
 * in the portal, so this payload is deliberately small.
 *
 * Shared by the in-app settings load AND /api/external/affiliate/status so the
 * two can never drift.
 */
import {
	getAffiliateByUserId,
	getPrimaryCode,
	getAffiliateConfig,
	getInternalProfileStatus
} from '$lib/server/database/queries/affiliates';
import { hasUsableLink, type AffiliateStatus } from '$lib/server/affiliate/eligibility';

export type AffiliateSettingsStatus = {
	programEnabled: boolean;
	/** Whether to render the card at all. */
	eligible: boolean;
	enrolled: boolean;
	status?: AffiliateStatus;
	linkActive?: boolean;
	connectComplete?: boolean;
	referralCode?: string | null;
	referralUrl?: string | null;
};

export async function getAffiliateSettingsStatus(
	userId: string,
	role: string | null | undefined,
	/** The portal origin — referral links land on the portal's /r/<CODE>. */
	marketingBaseUrl: string
): Promise<AffiliateSettingsStatus> {
	const config = await getAffiliateConfig();
	if (!config.programEnabled) {
		return { programEnabled: false, eligible: false, enrolled: false };
	}

	const affiliate = await getAffiliateByUserId(userId);

	if (!affiliate) {
		// Not enrolled. Only offer to join if the underlying account is ACTIVE —
		// pending, inactive and denied accounts never see the card at all.
		const profileStatus = await getInternalProfileStatus(userId, role ?? null);
		return {
			programEnabled: true,
			eligible: profileStatus === 'ACTIVE',
			enrolled: false
		};
	}

	const code = await getPrimaryCode(affiliate.id);
	const status = affiliate.status as AffiliateStatus;
	const linkActive = hasUsableLink(status);

	return {
		programEnabled: true,
		eligible: true,
		enrolled: true,
		status,
		linkActive,
		connectComplete: affiliate.connectPayoutsEnabled,
		referralCode: linkActive ? (code?.code ?? null) : null,
		// The landing lives on the PORTAL (/r/<CODE>), not the marketing site — that
		// is currently WordPress and cannot capture the cookie server-side.
		referralUrl:
			linkActive && code?.code
				? `${marketingBaseUrl.replace(/\/$/, '')}/r/${encodeURIComponent(code.code)}`
				: null
	};
}
