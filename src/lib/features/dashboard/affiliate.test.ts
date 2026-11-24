import { describe, expect, it } from 'vitest';
import { affiliateCardState } from './affiliate';

const base = { programEnabled: true, eligible: true, enrolled: true, status: 'ACTIVE' as const, connectComplete: true };

describe('affiliateCardState', () => {
	it('hides when the program is off or the account is not eligible', () => {
		expect(affiliateCardState({ ...base, programEnabled: false }).kind).toBe('hidden');
		expect(affiliateCardState({ ...base, eligible: false }).kind).toBe('hidden');
	});
	it('invites an eligible account that has not joined', () => {
		expect(affiliateCardState({ ...base, enrolled: false, status: undefined }).kind).toBe('join');
	});
	it('flags unfinished payout setup on an active affiliate', () => {
		expect(affiliateCardState(base)).toMatchObject({ kind: 'active', setupNeeded: false });
		expect(affiliateCardState({ ...base, connectComplete: false })).toMatchObject({ kind: 'active', setupNeeded: true });
	});
	it('explains pending, held and denied accounts', () => {
		for (const status of ['PENDING', 'ON_HOLD', 'DENIED'] as const) expect(affiliateCardState({ ...base, status }).kind).toBe('paused');
	});
});
