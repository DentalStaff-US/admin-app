import { describe, it, expect } from 'vitest';
import {
	resolveCommissionRate,
	computeCommissionCents,
	commissionableBaseCents,
	computeCommission,
	roundHalfUp,
	centsToDollarString,
	extractRegularCentsFromInvoice,
	resolveCommissionBase,
	type HoursBreakdownLike
} from '$lib/server/affiliate/commission';

/** 40 regular hours at $45/hr, no overtime. */
const FORTY_HOURS: HoursBreakdownLike = {
	regularHours: 40,
	overtimeHours: 0,
	regularCents: 180_000,
	overtimeCents: 0,
	billableCents: 180_000
};

/** 40 regular + 8 overtime at $45/hr. OT bills at 1.5x = $540. */
const FORTY_EIGHT_HOURS: HoursBreakdownLike = {
	regularHours: 40,
	overtimeHours: 8,
	regularCents: 180_000,
	overtimeCents: 54_000,
	billableCents: 234_000
};

describe('resolveCommissionRate', () => {
	it('falls back to the program default when there is no override', () => {
		expect(resolveCommissionRate({ affiliateOverride: null, programDefault: '2.50' })).toEqual({
			ratePercent: 2.5,
			source: 'PROGRAM_DEFAULT'
		});
	});

	it('prefers a per-affiliate override over the program default', () => {
		expect(resolveCommissionRate({ affiliateOverride: '5.00', programDefault: '2.50' })).toEqual({
			ratePercent: 5,
			source: 'AFFILIATE_OVERRIDE'
		});
	});

	it('treats an explicit 0% override as a real rate, not as "unset"', () => {
		// An affiliate whose earning is dialled to zero must not silently inherit 2.5%.
		expect(resolveCommissionRate({ affiliateOverride: '0.00', programDefault: '2.50' })).toEqual({
			ratePercent: 0,
			source: 'AFFILIATE_OVERRIDE'
		});
	});

	it('treats undefined and blank strings as no override', () => {
		expect(
			resolveCommissionRate({ affiliateOverride: undefined, programDefault: 2.5 }).source
		).toBe('PROGRAM_DEFAULT');
		expect(resolveCommissionRate({ affiliateOverride: '  ', programDefault: 2.5 }).source).toBe(
			'PROGRAM_DEFAULT'
		);
	});

	it('ignores a negative override rather than paying a negative commission', () => {
		expect(resolveCommissionRate({ affiliateOverride: '-3.00', programDefault: '2.50' })).toEqual({
			ratePercent: 2.5,
			source: 'PROGRAM_DEFAULT'
		});
	});

	it('throws when the program default is missing — never silently pays 0', () => {
		expect(() => resolveCommissionRate({ affiliateOverride: null, programDefault: '' })).toThrow();
	});

	it('accepts fractional rates that a smallint column could not hold', () => {
		expect(
			resolveCommissionRate({ affiliateOverride: null, programDefault: '7.25' }).ratePercent
		).toBe(7.25);
	});
});

describe('commissionableBaseCents — overtime exclusion', () => {
	it('uses regular hours only', () => {
		expect(commissionableBaseCents(FORTY_HOURS)).toBe(180_000);
	});

	it('EXCLUDES overtime: a 48-hour week has the same base as a 40-hour week', () => {
		expect(commissionableBaseCents(FORTY_EIGHT_HOURS)).toBe(commissionableBaseCents(FORTY_HOURS));
	});

	it('ignores billableCents entirely — that figure includes the OT premium', () => {
		const inflated = { ...FORTY_HOURS, billableCents: 999_999 };
		expect(commissionableBaseCents(inflated)).toBe(180_000);
	});

	it('is unmoved by any variation in the overtime fields', () => {
		for (const otCents of [0, 1, 54_000, 1_000_000]) {
			const b = { ...FORTY_HOURS, overtimeCents: otCents, overtimeHours: otCents / 6750 };
			expect(commissionableBaseCents(b)).toBe(180_000);
		}
	});
});

describe('computeCommissionCents', () => {
	it('computes 2.5% of $1,800 as $45.00', () => {
		expect(computeCommissionCents(180_000, 2.5)).toBe(4_500);
	});

	it('computes a 5% override of $1,800 as $90.00', () => {
		expect(computeCommissionCents(180_000, 5)).toBe(9_000);
	});

	it('returns 0 for a 0% rate', () => {
		expect(computeCommissionCents(180_000, 0)).toBe(0);
	});

	it('returns 0 for a zero base', () => {
		expect(computeCommissionCents(0, 2.5)).toBe(0);
	});

	it('rounds half away from zero at the cent', () => {
		// 1000 cents * 2.5% = 25 exactly; 1001 * 2.5% = 25.025 -> 25
		expect(computeCommissionCents(1_001, 2.5)).toBe(25);
		// 100 cents * 2.5% = 2.5 -> 3 (half up, not banker's rounding to 2)
		expect(computeCommissionCents(100, 2.5)).toBe(3);
	});

	it('rejects a negative or non-finite rate', () => {
		expect(() => computeCommissionCents(180_000, -1)).toThrow();
		expect(() => computeCommissionCents(180_000, NaN)).toThrow();
	});

	it('never emits fractional cents', () => {
		for (const base of [1, 7, 333, 99_999, 180_000, 1_234_567]) {
			for (const rate of [2.5, 3.33, 7.25, 12.5]) {
				expect(Number.isInteger(computeCommissionCents(base, rate))).toBe(true);
			}
		}
	});
});

describe('roundHalfUp', () => {
	it('rounds .5 away from zero in both directions, so a reversal mirrors its event', () => {
		expect(roundHalfUp(2.5)).toBe(3);
		expect(roundHalfUp(-2.5)).toBe(-3);
		expect(roundHalfUp(2.4)).toBe(2);
		expect(roundHalfUp(-2.4)).toBe(-2);
	});
});

describe('centsToDollarString', () => {
	it('formats for the numeric(12,2) columns', () => {
		expect(centsToDollarString(4_500)).toBe('45.00');
		expect(centsToDollarString(0)).toBe('0.00');
		expect(centsToDollarString(1)).toBe('0.01');
		expect(centsToDollarString(-4_500)).toBe('-45.00');
	});
});

describe('computeCommission — end to end', () => {
	it('produces the worked example from the design doc: $1,800 @ 2.5% = $45.00', () => {
		const result = computeCommission({
			breakdown: FORTY_HOURS,
			affiliateOverride: null,
			programDefault: '2.50'
		});
		expect(result.commissionAmount).toBe('45.00');
		expect(result.grossAmount).toBe('1800.00');
		expect(result.rate).toEqual({ ratePercent: 2.5, source: 'PROGRAM_DEFAULT' });
	});

	it('pays the SAME on a 48-hour week as on a 40-hour week', () => {
		const forty = computeCommission({
			breakdown: FORTY_HOURS,
			affiliateOverride: null,
			programDefault: '2.50'
		});
		const fortyEight = computeCommission({
			breakdown: FORTY_EIGHT_HOURS,
			affiliateOverride: null,
			programDefault: '2.50'
		});
		expect(fortyEight.commissionAmount).toBe(forty.commissionAmount);
	});

	it('records the excluded overtime in the snapshot for transparency', () => {
		const result = computeCommission({
			breakdown: FORTY_EIGHT_HOURS,
			affiliateOverride: null,
			programDefault: '2.50'
		});
		expect(result.snapshot.excludedOvertimeCents).toBe(54_000);
		expect(result.snapshot.baseCents).toBe(180_000);
		expect(result.snapshot.basis).toBe('REGULAR_HOURS_ONLY');
	});

	it('snapshots the rate AND its source, so history survives a later rate change', () => {
		const withOverride = computeCommission({
			breakdown: FORTY_HOURS,
			affiliateOverride: '5.00',
			programDefault: '2.50'
		});
		expect(withOverride.snapshot.ratePercent).toBe(5);
		expect(withOverride.snapshot.rateSource).toBe('AFFILIATE_OVERRIDE');
		expect(withOverride.commissionAmount).toBe('90.00');
	});

	it('keeps the snapshot internally consistent with the emitted amounts', () => {
		const result = computeCommission({
			breakdown: FORTY_EIGHT_HOURS,
			affiliateOverride: '3.33',
			programDefault: '2.50'
		});
		expect(centsToDollarString(result.snapshot.commissionCents)).toBe(result.commissionAmount);
		expect(centsToDollarString(result.snapshot.baseCents)).toBe(result.grossAmount);
	});
});

describe('extractRegularCentsFromInvoice', () => {
	const REGULAR = { description: 'Regular hours worked for Jane Doe', amount: 180_000 };
	const OVERTIME = { description: 'Overtime hours (1.5×)', amount: 54_000 };
	const OVERTIME_SPLIT = {
		description: 'Overtime hours (1.5×) — week already at 40.00 hrs on a prior timesheet',
		amount: 27_000
	};
	const ADMIN_FEE = { description: 'Administration Fees', amount: 18_000 };
	const PROCESSING = { description: 'Processing Fee (3%)', amount: 5_940 };
	const EXPENSE = { description: 'Expense: parking', amount: 1_200 };

	it('returns only the regular-hours line', () => {
		expect(
			extractRegularCentsFromInvoice([REGULAR, OVERTIME, ADMIN_FEE, PROCESSING, EXPENSE])
		).toBe(180_000);
	});

	it('excludes overtime even when the description carries the split-week suffix', () => {
		expect(extractRegularCentsFromInvoice([REGULAR, OVERTIME_SPLIT])).toBe(180_000);
	});

	it('excludes the administration fee — that is the platform fee, not commissionable', () => {
		expect(extractRegularCentsFromInvoice([REGULAR, ADMIN_FEE])).toBe(180_000);
	});

	it('excludes the card processing fee', () => {
		expect(extractRegularCentsFromInvoice([REGULAR, PROCESSING])).toBe(180_000);
	});

	it('excludes reimbursed expenses', () => {
		expect(extractRegularCentsFromInvoice([REGULAR, EXPENSE])).toBe(180_000);
	});

	it('sums multiple labour lines', () => {
		expect(
			extractRegularCentsFromInvoice([
				{ description: 'Regular hours worked for Jane Doe', amount: 90_000 },
				{ description: 'Regular hours worked for John Roe', amount: 45_000 }
			])
		).toBe(135_000);
	});

	it('returns null for an empty or missing list so the caller can fall back', () => {
		expect(extractRegularCentsFromInvoice([])).toBeNull();
		expect(extractRegularCentsFromInvoice(null)).toBeNull();
		expect(extractRegularCentsFromInvoice(undefined)).toBeNull();
	});

	it('returns null when the invoice contains only fees (no labour at all)', () => {
		expect(extractRegularCentsFromInvoice([ADMIN_FEE, PROCESSING])).toBeNull();
	});

	it('ignores items with a non-numeric amount rather than counting them as zero', () => {
		expect(extractRegularCentsFromInvoice([REGULAR, { description: 'Weird', amount: null }])).toBe(
			180_000
		);
	});
});

describe('resolveCommissionBase', () => {
	const breakdown: HoursBreakdownLike = {
		regularHours: 40,
		overtimeHours: 0,
		regularCents: 180_000,
		overtimeCents: 0,
		billableCents: 180_000
	};

	it('prefers the invoice — it is what the client actually paid', () => {
		const result = resolveCommissionBase({
			invoiceLineItems: [{ description: 'Regular hours worked for Jane', amount: 180_000 }],
			recomputed: breakdown
		});
		expect(result).toEqual({ baseCents: 180_000, source: 'INVOICE_LINE_ITEMS' });
	});

	it('falls back to recomputation when the invoice is unusable', () => {
		const result = resolveCommissionBase({ invoiceLineItems: null, recomputed: breakdown });
		expect(result).toEqual({ baseCents: 180_000, source: 'RECOMPUTED' });
	});

	it('records a discrepancy when the invoice and the recomputation disagree', () => {
		// A split week can legitimately produce this; it must be visible, not silent.
		const result = resolveCommissionBase({
			invoiceLineItems: [{ description: 'Regular hours worked for Jane', amount: 135_000 }],
			recomputed: breakdown
		});
		expect(result).toEqual({
			baseCents: 135_000,
			source: 'INVOICE_LINE_ITEMS',
			discrepancyCents: -45_000
		});
	});

	it('reports no discrepancy when they agree', () => {
		const result = resolveCommissionBase({
			invoiceLineItems: [{ description: 'Regular hours worked for Jane', amount: 180_000 }],
			recomputed: breakdown
		});
		expect(result).not.toHaveProperty('discrepancyCents');
	});
});
