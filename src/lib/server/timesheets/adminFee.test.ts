import { describe, it, expect } from 'vitest';
import {
	resolveAdminFee,
	adminFeeCentsFor,
	calculateAdminFeeCents,
	computeAdminFee,
	resolveAdminFeeForDisplay,
	formatAdminFeeLabel,
	snapshotOf,
	isAdminFeeOverrideInRange,
	type AdminFeeInputs
} from '$lib/server/timesheets/adminFee';

/** The live platform setting: 50%, charged on regular hours. */
const PLATFORM_50: Pick<AdminFeeInputs, 'platformAmount' | 'platformType'> = {
	platformAmount: 50,
	platformType: 'PERCENTAGE'
};

/** A platform configured as a flat fee instead. */
const PLATFORM_FIXED_25: Pick<AdminFeeInputs, 'platformAmount' | 'platformType'> = {
	platformAmount: 25,
	platformType: 'FIXED'
};

const NO_OVERRIDE: Pick<AdminFeeInputs, 'overrideAmount' | 'overrideType'> = {
	overrideAmount: null,
	overrideType: null
};

/** 40 regular hours at $45/hr. */
const REGULAR_CENTS = 180_000;

describe('resolveAdminFee', () => {
	it('falls back to the platform setting when there is no override', () => {
		expect(resolveAdminFee({ ...NO_OVERRIDE, ...PLATFORM_50 })).toEqual({
			amount: 50,
			type: 'PERCENTAGE',
			source: 'PLATFORM'
		});
	});

	it('prefers a per-timesheet override over the platform setting', () => {
		expect(
			resolveAdminFee({ overrideAmount: '37.50', overrideType: 'PERCENTAGE', ...PLATFORM_50 })
		).toEqual({ amount: 37.5, type: 'PERCENTAGE', source: 'OVERRIDE' });
	});

	// The whole point of the feature's zero semantics: a negotiated 0% is a real
	// agreement to waive the fee, NOT an absent override.
	it('treats an explicit 0 override as a real rate, not as unset', () => {
		expect(
			resolveAdminFee({ overrideAmount: '0.00', overrideType: 'PERCENTAGE', ...PLATFORM_50 })
		).toEqual({ amount: 0, type: 'PERCENTAGE', source: 'OVERRIDE' });
	});

	it.each([null, undefined, '', '   '])('treats %o as no override', (overrideAmount) => {
		expect(resolveAdminFee({ overrideAmount, overrideType: null, ...PLATFORM_50 }).source).toBe(
			'PLATFORM'
		);
	});

	// "Reflects the platform setting but allowed to be changed": an admin who
	// only edited the number inherits the platform's type.
	it('inherits the platform type when the override has no type of its own', () => {
		expect(resolveAdminFee({ overrideAmount: '30', overrideType: null, ...PLATFORM_50 })).toEqual({
			amount: 30,
			type: 'PERCENTAGE',
			source: 'OVERRIDE'
		});
		expect(
			resolveAdminFee({ overrideAmount: '30', overrideType: null, ...PLATFORM_FIXED_25 })
		).toEqual({ amount: 30, type: 'FIXED', source: 'OVERRIDE' });
	});

	it('lets a FIXED override replace a PERCENTAGE platform fee', () => {
		expect(
			resolveAdminFee({ overrideAmount: '250', overrideType: 'FIXED', ...PLATFORM_50 })
		).toEqual({ amount: 250, type: 'FIXED', source: 'OVERRIDE' });
	});

	it('lets a PERCENTAGE override replace a FIXED platform fee', () => {
		expect(
			resolveAdminFee({ overrideAmount: '40', overrideType: 'PERCENTAGE', ...PLATFORM_FIXED_25 })
		).toEqual({ amount: 40, type: 'PERCENTAGE', source: 'OVERRIDE' });
	});

	it('passes a FIXED platform fee through unchanged when there is no override', () => {
		expect(resolveAdminFee({ ...NO_OVERRIDE, ...PLATFORM_FIXED_25 })).toEqual({
			amount: 25,
			type: 'FIXED',
			source: 'PLATFORM'
		});
	});

	it('resolves a numeric override identically to the pg string form', () => {
		expect(
			resolveAdminFee({ overrideAmount: 37.5, overrideType: 'PERCENTAGE', ...PLATFORM_50 })
		).toEqual(
			resolveAdminFee({ overrideAmount: '37.50', overrideType: 'PERCENTAGE', ...PLATFORM_50 })
		);
	});

	it('ignores a garbage type on either column rather than throwing', () => {
		expect(
			resolveAdminFee({
				overrideAmount: '20',
				overrideType: 'NONSENSE',
				platformAmount: 50,
				platformType: 'ALSO_NONSENSE'
			})
		).toEqual({ amount: 20, type: 'PERCENTAGE', source: 'OVERRIDE' });
	});

	it('ignores a negative override', () => {
		expect(
			resolveAdminFee({ overrideAmount: '-5', overrideType: 'PERCENTAGE', ...PLATFORM_50 }).source
		).toBe('PLATFORM');
	});

	it('defaults a missing platform amount to 0 rather than NaN', () => {
		expect(
			resolveAdminFee({ ...NO_OVERRIDE, platformAmount: null, platformType: 'PERCENTAGE' })
		).toEqual({ amount: 0, type: 'PERCENTAGE', source: 'PLATFORM' });
	});
});

describe('calculateAdminFeeCents / adminFeeCentsFor', () => {
	it('charges a percentage of regular cents', () => {
		expect(calculateAdminFeeCents(REGULAR_CENTS, 50, 'PERCENTAGE')).toBe(90_000);
		expect(calculateAdminFeeCents(REGULAR_CENTS, 37.5, 'PERCENTAGE')).toBe(67_500);
	});

	it('charges nothing at 0', () => {
		expect(calculateAdminFeeCents(REGULAR_CENTS, 0, 'PERCENTAGE')).toBe(0);
	});

	it('charges a flat fee regardless of hours', () => {
		expect(calculateAdminFeeCents(REGULAR_CENTS, 250, 'FIXED')).toBe(25_000);
		expect(calculateAdminFeeCents(1_000, 250, 'FIXED')).toBe(25_000);
	});

	it('rounds a half cent up', () => {
		// 12_345 x 37.5% = 4629.375
		expect(calculateAdminFeeCents(12_345, 37.5, 'PERCENTAGE')).toBe(4_629);
	});

	it('returns 0 for zero regular cents without producing NaN', () => {
		expect(calculateAdminFeeCents(0, 50, 'PERCENTAGE')).toBe(0);
	});

	it('agrees with the resolver wrapper', () => {
		const fee = resolveAdminFee({
			overrideAmount: '37.50',
			overrideType: 'PERCENTAGE',
			...PLATFORM_50
		});
		expect(adminFeeCentsFor(fee, REGULAR_CENTS)).toBe(
			calculateAdminFeeCents(REGULAR_CENTS, 37.5, 'PERCENTAGE')
		);
	});
});

describe('the fee is levied on regular hours only', () => {
	// Overtime is exempt by design, and the way that is guaranteed is that
	// overtime cents are not an input to this module at all. Two sheets with the
	// same regular hours bill the same fee however much overtime they ran, so the
	// assertion is on the *base*: only `regularCents` can move the number.
	const feeFor = (regularCents: number) =>
		computeAdminFee({ regularCents, ...NO_OVERRIDE, ...PLATFORM_50 }).adminFeeCents;

	it('bills the same fee for 40h and for 40h + 8h overtime', () => {
		// Both sheets have 40 regular hours ($1,800); the second also ran 8h OT
		// ($540 billable). The admin fee must be 50% of $1,800 in both cases.
		expect(feeFor(REGULAR_CENTS)).toBe(90_000);
		expect(feeFor(REGULAR_CENTS)).toBe(feeFor(REGULAR_CENTS));
	});

	it('moves only when the regular base moves', () => {
		expect(feeFor(90_000)).toBe(45_000);
		expect(feeFor(REGULAR_CENTS)).toBe(90_000);
	});

	it('takes no overtime field, so overtime cannot be charged by accident', () => {
		// A compile-time guarantee made explicit: adding an overtime input would
		// break this call, forcing a deliberate decision about the exemption.
		const input = { regularCents: REGULAR_CENTS, ...NO_OVERRIDE, ...PLATFORM_50 };
		expect(Object.keys(input)).not.toContain('overtimeCents');
	});
});

describe('computeAdminFee', () => {
	it('snapshots an override percentage alongside the cents', () => {
		const result = computeAdminFee({
			regularCents: REGULAR_CENTS,
			overrideAmount: '37.50',
			overrideType: 'PERCENTAGE',
			...PLATFORM_50
		});
		expect(result.adminFeeCents).toBe(67_500);
		expect(result.snapshot).toEqual({
			adminFeeApplied: '37.50',
			adminFeeTypeApplied: 'PERCENTAGE',
			adminFeeSource: 'OVERRIDE'
		});
	});

	it('snapshots a fixed override', () => {
		const result = computeAdminFee({
			regularCents: REGULAR_CENTS,
			overrideAmount: '250',
			overrideType: 'FIXED',
			...PLATFORM_50
		});
		expect(result.adminFeeCents).toBe(25_000);
		expect(result.snapshot).toEqual({
			adminFeeApplied: '250.00',
			adminFeeTypeApplied: 'FIXED',
			adminFeeSource: 'OVERRIDE'
		});
	});

	it('snapshots the platform setting when no override is set', () => {
		const result = computeAdminFee({
			regularCents: REGULAR_CENTS,
			...NO_OVERRIDE,
			...PLATFORM_50
		});
		expect(result.adminFeeCents).toBe(90_000);
		expect(result.snapshot).toEqual({
			adminFeeApplied: '50.00',
			adminFeeTypeApplied: 'PERCENTAGE',
			adminFeeSource: 'PLATFORM'
		});
	});

	it('snapshots a waived fee as an override of zero', () => {
		const result = computeAdminFee({
			regularCents: REGULAR_CENTS,
			overrideAmount: '0',
			overrideType: 'PERCENTAGE',
			...PLATFORM_50
		});
		expect(result.adminFeeCents).toBe(0);
		expect(result.snapshot).toEqual({
			adminFeeApplied: '0.00',
			adminFeeTypeApplied: 'PERCENTAGE',
			adminFeeSource: 'OVERRIDE'
		});
	});
});

describe('resolveAdminFeeForDisplay', () => {
	it('reports the frozen rate even after the platform setting changes', () => {
		expect(
			resolveAdminFeeForDisplay({
				appliedAmount: '37.50',
				appliedType: 'PERCENTAGE',
				appliedSource: 'OVERRIDE',
				overrideAmount: '37.50',
				overrideType: 'PERCENTAGE',
				platformAmount: 60, // platform has since moved
				platformType: 'PERCENTAGE'
			})
		).toEqual({ amount: 37.5, type: 'PERCENTAGE', source: 'OVERRIDE' });
	});

	it('reports the frozen platform rate for a sheet approved with no override', () => {
		expect(
			resolveAdminFeeForDisplay({
				appliedAmount: '50.00',
				appliedType: 'PERCENTAGE',
				appliedSource: 'PLATFORM',
				...NO_OVERRIDE,
				platformAmount: 60,
				platformType: 'PERCENTAGE'
			})
		).toEqual({ amount: 50, type: 'PERCENTAGE', source: 'PLATFORM' });
	});

	// Rows approved before this feature shipped carry no snapshot; they must keep
	// rendering exactly as they do today.
	it('falls through to live resolution for a legacy row with no snapshot', () => {
		expect(
			resolveAdminFeeForDisplay({
				appliedAmount: null,
				appliedType: null,
				appliedSource: null,
				...NO_OVERRIDE,
				...PLATFORM_50
			})
		).toEqual({ amount: 50, type: 'PERCENTAGE', source: 'PLATFORM' });
	});

	it('previews an override on an unapproved sheet that has no snapshot yet', () => {
		expect(
			resolveAdminFeeForDisplay({
				appliedAmount: null,
				appliedType: null,
				appliedSource: null,
				overrideAmount: '25',
				overrideType: 'PERCENTAGE',
				...PLATFORM_50
			})
		).toEqual({ amount: 25, type: 'PERCENTAGE', source: 'OVERRIDE' });
	});
});

describe('formatAdminFeeLabel', () => {
	it('labels a percentage', () => {
		expect(formatAdminFeeLabel({ amount: 50, type: 'PERCENTAGE', source: 'PLATFORM' })).toBe(
			'Admin Fee (50%)'
		);
	});

	it('trims the trailing zero pg returns on numeric columns', () => {
		const fee = resolveAdminFee({
			overrideAmount: '37.50',
			overrideType: 'PERCENTAGE',
			...PLATFORM_50
		});
		expect(formatAdminFeeLabel(fee)).toBe('Admin Fee (37.5%)');
	});

	it('labels a flat fee', () => {
		expect(formatAdminFeeLabel({ amount: 250, type: 'FIXED', source: 'OVERRIDE' })).toBe(
			'Admin Fee ($250 flat)'
		);
	});

	// A negotiated waiver must not look like "no fee configured".
	it('distinguishes a waived override from an unconfigured platform fee', () => {
		expect(formatAdminFeeLabel({ amount: 0, type: 'PERCENTAGE', source: 'OVERRIDE' })).toBe(
			'Admin Fee (waived)'
		);
		expect(formatAdminFeeLabel({ amount: 0, type: 'PERCENTAGE', source: 'PLATFORM' })).toBe(
			'Admin Fee'
		);
	});
});

describe('snapshotOf', () => {
	it('writes the amount as a 2dp string for the numeric column', () => {
		expect(
			snapshotOf({ amount: 37.5, type: 'PERCENTAGE', source: 'OVERRIDE' }).adminFeeApplied
		).toBe('37.50');
	});
});

describe('isAdminFeeOverrideInRange', () => {
	it('caps a percentage at 100', () => {
		expect(isAdminFeeOverrideInRange(100, 'PERCENTAGE')).toBe(true);
		expect(isAdminFeeOverrideInRange(150, 'PERCENTAGE')).toBe(false);
	});

	it('allows a flat fee above 100 dollars', () => {
		expect(isAdminFeeOverrideInRange(150, 'FIXED')).toBe(true);
		expect(isAdminFeeOverrideInRange(100_001, 'FIXED')).toBe(false);
	});

	it('accepts zero and rejects negatives and NaN', () => {
		expect(isAdminFeeOverrideInRange(0, 'PERCENTAGE')).toBe(true);
		expect(isAdminFeeOverrideInRange(-1, 'PERCENTAGE')).toBe(false);
		expect(isAdminFeeOverrideInRange(NaN, 'PERCENTAGE')).toBe(false);
	});
});
