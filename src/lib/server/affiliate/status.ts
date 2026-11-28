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
	getAffiliateSummary,
	getPrimaryCode,
	getAffiliateConfig,
	getInternalProfileStatus
} from '$lib/server/database/queries/affiliates';
import { resolveCommissionRate } from '$lib/server/affiliate/commission';
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

/** The dashboard widget: the settings status plus this person's own activity. */
export type AffiliateOverview = AffiliateSettingsStatus & {
	/** Their rate, or the program's when they haven't joined. */
	ratePercent: string | null;
	/** Null until they've joined. Earnings are dollars. */
	activity: {
		clicks: number;
		referralsActive: number;
		referralsPending: number;
		earningsUnpaid: number;
		earningsPaid: number;
	} | null;
};

/**
 * Settings stays status-and-link only; the practice dashboard and the
 * professional's Home show this summary, with the detail in the portal.
 */
export async function getAffiliateOverview(
	userId: string,
	role: string | null | undefined,
	portalBaseUrl: string
): Promise<AffiliateOverview> {
	const status = await getAffiliateSettingsStatus(userId, role, portalBaseUrl);
	// Ineligible accounts never learn the program exists, so there's nothing to add.
	if (!status.programEnabled || !status.eligible) return { ...status, ratePercent: null, activity: null };

	const [config, affiliate] = await Promise.all([getAffiliateConfig(), getAffiliateByUserId(userId)]);
	const { ratePercent } = resolveCommissionRate({
		affiliateOverride: affiliate?.commissionRateOverride ?? null,
		programDefault: config.commissionRate
	});
	if (!affiliate) return { ...status, ratePercent: String(ratePercent), activity: null };

	const summary = await getAffiliateSummary(affiliate.id);
	return {
		...status,
		ratePercent: String(ratePercent),
		activity: {
			clicks: summary.clicks,
			referralsActive: summary.referrals.qualified,
			referralsPending: summary.referrals.pending,
			// Pending and approved are both owed and not yet paid out.
			earningsUnpaid: Number(summary.earnings.pending) + Number(summary.earnings.approved),
			earningsPaid: Number(summary.earnings.paid)
		}
	};
}
