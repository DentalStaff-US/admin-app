/** What the affiliate card shows for each state. Pure; tested. */
import type { AffiliateOverview } from '$lib/server/affiliate/status';

export type AffiliateCardState =
	| { kind: 'hidden' }
	| { kind: 'join' }
	| { kind: 'active'; badge: { status: string; label: string }; setupNeeded: boolean }
	| { kind: 'paused'; badge: { status: string; label: string }; message: string };

export function affiliateCardState(o: Pick<AffiliateOverview, 'programEnabled' | 'eligible' | 'enrolled' | 'status' | 'connectComplete'>): AffiliateCardState {
	if (!o.programEnabled || !o.eligible) return { kind: 'hidden' };
	if (!o.enrolled) return { kind: 'join' };
	if (o.status === 'ACTIVE') {
		return {
			kind: 'active',
			badge: o.connectComplete ? { status: 'ACTIVE', label: 'Active' } : { status: 'MISSING_GRACE', label: 'Setup incomplete' },
			setupNeeded: !o.connectComplete
		};
	}
	if (o.status === 'PENDING') {
		return { kind: 'paused', badge: { status: 'PENDING', label: 'Awaiting approval' }, message: "Your application is being reviewed. We'll email you once it's approved." };
	}
	return {
		kind: 'paused',
		badge: o.status === 'ON_HOLD' ? { status: 'ON_HOLD', label: 'On hold' } : { status: 'INACTIVE', label: 'Inactive' },
		message: "Your affiliate account isn't active right now. Commission you've already earned will still be paid."
	};
}
