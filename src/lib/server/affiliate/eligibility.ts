/**
 * Affiliate eligibility. Pure and dependency-free.
 *
 * THE RULE (locked with the client):
 *   Only ACTIVE practices and professionals may participate. A PENDING,
 *   INACTIVE or DENIED account never gets a link at all — and if an ACTIVE
 *   account is moved to another status, its affiliate status flips with it.
 *
 *   External partners have no internal status; they are governed solely by the
 *   affiliate status an admin sets.
 *
 *   A status flip stops NEW accrual but does NOT confiscate an earned balance:
 *   existing PENDING/APPROVED events still pay out on their normal schedule.
 *   DENIED is terminal and additionally freezes the balance for admin
 *   resolution.
 */
import { USER_ROLES } from '$lib/config/constants';

export type AffiliateStatus = 'PENDING' | 'ACTIVE' | 'ON_HOLD' | 'DENIED';
export type InternalProfileStatus = 'INACTIVE' | 'PENDING' | 'ACTIVE' | 'DENIED';

export type EligibilityInput = {
	role: string | null | undefined;
	/**
	 * client_profiles.status or candidate_profiles.status. Null when the user has
	 * no profile row yet, or when the role is EXTERNAL_PARTNER (no internal
	 * status exists).
	 */
	profileStatus: InternalProfileStatus | null;
	currentStatus: AffiliateStatus;
	/**
	 * True when an admin set the current status by hand. A sync must never
	 * silently undo an admin decision.
	 */
	statusSetManually: boolean;
};

export type EligibilityDecision = {
	/** The status the affiliate should hold. Equal to `currentStatus` when nothing changes. */
	status: AffiliateStatus;
	changed: boolean;
	reason: string;
};

/** Whether a role participates via an internal profile status. */
export function isInternalAffiliateRole(role: string | null | undefined): boolean {
	return (
		role === USER_ROLES.CLIENT || role === USER_ROLES.CLIENT_STAFF || role === USER_ROLES.CANDIDATE
	);
}

/**
 * Re-derive an affiliate's status from its underlying account.
 *
 * Called both event-driven (wherever a profile status is written) and from the
 * nightly reconciliation job — the job is not belt-and-braces, because statuses
 * get edited directly in the DB during support work where no hook can see them.
 */
export function decideEligibility(input: EligibilityInput): EligibilityDecision {
	// DENIED is terminal. Never auto-clear it, however the profile changes.
	if (input.currentStatus === 'DENIED') {
		return { status: 'DENIED', changed: false, reason: 'DENIED_IS_TERMINAL' };
	}

	// An admin's manual decision outranks the derived one. (DENIED is handled
	// above; this covers a manual ON_HOLD on an otherwise-ACTIVE account.)
	if (input.statusSetManually) {
		return {
			status: input.currentStatus,
			changed: false,
			reason: 'MANUAL_STATUS_PRESERVED'
		};
	}

	// External partners have no internal profile to derive from.
	if (!isInternalAffiliateRole(input.role)) {
		return {
			status: input.currentStatus,
			changed: false,
			reason: 'EXTERNAL_PARTNER_NOT_DERIVED'
		};
	}

	const target: AffiliateStatus = input.profileStatus === 'ACTIVE' ? 'ACTIVE' : 'ON_HOLD';
	const reason =
		input.profileStatus === 'ACTIVE'
			? 'PROFILE_ACTIVE'
			: `PROFILE_STATUS:${input.profileStatus ?? 'MISSING'}`;

	return {
		status: target,
		changed: target !== input.currentStatus,
		reason
	};
}

/** Whether NEW commission may accrue to this affiliate right now. */
export function canAccrue(status: AffiliateStatus): boolean {
	return status === 'ACTIVE';
}

/**
 * Whether an already-earned balance may still be paid out.
 *
 * ON_HOLD deliberately returns true: per the client, admins block FUTURE
 * payouts, but whatever is already owed is reconciled first. Only DENIED
 * freezes the balance.
 */
export function canReceivePayout(status: AffiliateStatus): boolean {
	return status === 'ACTIVE' || status === 'ON_HOLD';
}

/** Whether the affiliate's referral link should resolve at all. */
export function hasUsableLink(status: AffiliateStatus): boolean {
	return status === 'ACTIVE';
}
