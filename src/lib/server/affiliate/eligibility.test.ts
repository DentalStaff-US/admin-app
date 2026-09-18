import { describe, it, expect } from 'vitest';
import {
	decideEligibility,
	canAccrue,
	canReceivePayout,
	hasUsableLink,
	isInternalAffiliateRole,
	type EligibilityInput
} from '$lib/server/affiliate/eligibility';

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
	return {
		role: 'CANDIDATE',
		profileStatus: 'ACTIVE',
		currentStatus: 'ACTIVE',
		statusSetManually: false,
		...overrides
	};
}

describe('decideEligibility — derived from the internal profile', () => {
	it('keeps an ACTIVE profile ACTIVE', () => {
		expect(decideEligibility(input())).toEqual({
			status: 'ACTIVE',
			changed: false,
			reason: 'PROFILE_ACTIVE'
		});
	});

	for (const profileStatus of ['PENDING', 'INACTIVE', 'DENIED'] as const) {
		it(`flips an ACTIVE affiliate to ON_HOLD when the profile becomes ${profileStatus}`, () => {
			const d = decideEligibility(input({ profileStatus, currentStatus: 'ACTIVE' }));
			expect(d.status).toBe('ON_HOLD');
			expect(d.changed).toBe(true);
			expect(d.reason).toBe(`PROFILE_STATUS:${profileStatus}`);
		});
	}

	it('reactivates when the profile returns to ACTIVE', () => {
		const d = decideEligibility(input({ profileStatus: 'ACTIVE', currentStatus: 'ON_HOLD' }));
		expect(d).toEqual({ status: 'ACTIVE', changed: true, reason: 'PROFILE_ACTIVE' });
	});

	it('holds when there is no profile row at all', () => {
		const d = decideEligibility(input({ profileStatus: null, currentStatus: 'ACTIVE' }));
		expect(d.status).toBe('ON_HOLD');
		expect(d.reason).toBe('PROFILE_STATUS:MISSING');
	});

	it('applies to practices as well as professionals', () => {
		const d = decideEligibility(input({ role: 'CLIENT', profileStatus: 'INACTIVE' }));
		expect(d.status).toBe('ON_HOLD');
	});

	it('applies to client staff', () => {
		const d = decideEligibility(input({ role: 'CLIENT_STAFF', profileStatus: 'PENDING' }));
		expect(d.status).toBe('ON_HOLD');
	});
});

describe('decideEligibility — admin decisions outrank derivation', () => {
	it('never auto-clears a DENIED affiliate, even with an ACTIVE profile', () => {
		const d = decideEligibility(input({ currentStatus: 'DENIED', profileStatus: 'ACTIVE' }));
		expect(d).toEqual({ status: 'DENIED', changed: false, reason: 'DENIED_IS_TERMINAL' });
	});

	it('preserves a manual ON_HOLD against an ACTIVE profile', () => {
		const d = decideEligibility(
			input({ currentStatus: 'ON_HOLD', profileStatus: 'ACTIVE', statusSetManually: true })
		);
		expect(d).toEqual({
			status: 'ON_HOLD',
			changed: false,
			reason: 'MANUAL_STATUS_PRESERVED'
		});
	});

	it('still derives when the status was not set manually', () => {
		const d = decideEligibility(
			input({ currentStatus: 'ON_HOLD', profileStatus: 'ACTIVE', statusSetManually: false })
		);
		expect(d.status).toBe('ACTIVE');
	});
});

describe('decideEligibility — external partners', () => {
	it('is never derived from an internal status', () => {
		const d = decideEligibility(
			input({ role: 'EXTERNAL_PARTNER', profileStatus: null, currentStatus: 'ACTIVE' })
		);
		expect(d).toEqual({
			status: 'ACTIVE',
			changed: false,
			reason: 'EXTERNAL_PARTNER_NOT_DERIVED'
		});
	});

	it('stays PENDING until an admin approves', () => {
		const d = decideEligibility(
			input({ role: 'EXTERNAL_PARTNER', profileStatus: null, currentStatus: 'PENDING' })
		);
		expect(d.status).toBe('PENDING');
		expect(d.changed).toBe(false);
	});
});

describe('isInternalAffiliateRole', () => {
	it('covers practices, staff and professionals', () => {
		expect(isInternalAffiliateRole('CLIENT')).toBe(true);
		expect(isInternalAffiliateRole('CLIENT_STAFF')).toBe(true);
		expect(isInternalAffiliateRole('CANDIDATE')).toBe(true);
	});
	it('excludes external partners and admins', () => {
		expect(isInternalAffiliateRole('EXTERNAL_PARTNER')).toBe(false);
		expect(isInternalAffiliateRole('SUPERADMIN')).toBe(false);
		expect(isInternalAffiliateRole(null)).toBe(false);
	});
});

describe('accrual vs payout vs link', () => {
	it('only ACTIVE affiliates accrue new commission', () => {
		expect(canAccrue('ACTIVE')).toBe(true);
		expect(canAccrue('ON_HOLD')).toBe(false);
		expect(canAccrue('PENDING')).toBe(false);
		expect(canAccrue('DENIED')).toBe(false);
	});

	it('ON_HOLD still gets paid what is already owed — blocking is forward-only', () => {
		// Per the client: admins block FUTURE payouts, but whatever is owed is
		// reconciled first.
		expect(canReceivePayout('ON_HOLD')).toBe(true);
		expect(canReceivePayout('ACTIVE')).toBe(true);
	});

	it('DENIED freezes the balance for manual resolution', () => {
		expect(canReceivePayout('DENIED')).toBe(false);
	});

	it('a PENDING (unapproved) affiliate cannot be paid', () => {
		expect(canReceivePayout('PENDING')).toBe(false);
	});

	it('only ACTIVE affiliates have a working link', () => {
		expect(hasUsableLink('ACTIVE')).toBe(true);
		expect(hasUsableLink('ON_HOLD')).toBe(false);
		expect(hasUsableLink('PENDING')).toBe(false);
		expect(hasUsableLink('DENIED')).toBe(false);
	});
});
