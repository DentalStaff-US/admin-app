/**
 * Pure rules for the practice dashboard (10 §4.1): which single Notice to show,
 * and this month's date range for "Shifts this month".
 */
import type { ClientStatus } from '$lib/config/constants';
import { businessDate } from './window';

export type PracticeNotice =
	| { kind: 'account'; status: ClientStatus }
	| { kind: 'billing' }
	| null;

/** One Notice at most, highest priority first (10 §4.1). */
export function pickNotice(input: {
	status: ClientStatus;
	canCreateRequisitions: boolean;
	isOwner: boolean;
	billingSetUp: boolean;
	invoiceMethod: string | null;
}): PracticeNotice {
	if (!input.canCreateRequisitions) return { kind: 'account', status: input.status };
	// Paper-invoiced practices never pay through Stripe, so there's nothing to set up.
	if (input.isOwner && !input.billingSetUp && input.invoiceMethod !== 'PAPER') return { kind: 'billing' };
	return null;
}

export function monthBounds(now = new Date()): { first: string; last: string } {
	const today = businessDate(now);
	const [y, m] = today.split('-').map(Number);
	const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return { first: `${today.slice(0, 7)}-01`, last: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` };
}
