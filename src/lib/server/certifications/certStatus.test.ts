import { describe, it, expect } from 'vitest';
import {
	certState,
	isCertBlocked,
	daysUntilExpiry,
	todayInET,
	CERT_EXPIRING_SOON_DAYS
} from './certStatus';

const TODAY = '2026-04-30';

/** Shorthand: a discipline that requires a credential, with the given expiry. */
const req = (effectiveExpiry: string | null) => ({ requiresCertification: true, effectiveExpiry });
/** A discipline that requires nothing. */
const notReq = (effectiveExpiry: string | null) => ({
	requiresCertification: false,
	effectiveExpiry
});

describe('todayInET', () => {
	it('resolves the business-timezone date, not the UTC date', () => {
		// 03:00 UTC on May 1 is 23:00 ET on Apr 30. Using the UTC date here would
		// advance "today" by a day and lock out a professional whose credential is
		// still valid — the specific bug this helper exists to prevent.
		expect(todayInET(new Date('2026-05-01T03:00:00Z'))).toBe('2026-04-30');
	});

	it('does not lag for an evening Pacific timestamp', () => {
		// 2026-05-01 00:30 UTC = Apr 30 17:30 PT = Apr 30 20:30 ET.
		expect(todayInET(new Date('2026-05-01T00:30:00Z'))).toBe('2026-04-30');
	});
});

describe('certState', () => {
	it('is NOT_REQUIRED when the discipline needs no credential', () => {
		expect(certState(notReq(null), TODAY)).toBe('NOT_REQUIRED');
	});

	it('is NOT_REQUIRED even with a long-lapsed credential on file', () => {
		// A professional who volunteered a certificate for a discipline that does not
		// require one must not lose their livelihood when it lapses. Enforcement
		// follows the requirement, and this is also the per-discipline kill switch:
		// un-flagging a discipline restores visibility immediately.
		expect(certState(notReq('2020-01-01'), TODAY)).toBe('NOT_REQUIRED');
		expect(isCertBlocked(notReq('2020-01-01'), TODAY)).toBe(false);
	});

	it('is MISSING — and NOT blocked — when required but nothing is on file', () => {
		// Deploy-safety property. If a refactor ever "tidies" MISSING into a block,
		// flagging one discipline hides shifts from every professional holding it.
		expect(certState(req(null), TODAY)).toBe('MISSING');
		expect(isCertBlocked(req(null), TODAY)).toBe(false);
	});

	it('is not blocked ON the expiry date itself', () => {
		// A credential is valid THROUGH its printed date.
		expect(certState(req(TODAY), TODAY)).toBe('EXPIRING');
		expect(isCertBlocked(req(TODAY), TODAY)).toBe(false);
	});

	it('is EXPIRED and blocked the day after the expiry date', () => {
		expect(certState(req('2026-04-29'), TODAY)).toBe('EXPIRED');
		expect(isCertBlocked(req('2026-04-29'), TODAY)).toBe(true);
	});

	it('is EXPIRING inside the warning window and VALID outside it', () => {
		expect(certState(req('2026-05-01'), TODAY)).toBe('EXPIRING'); // 1 day
		expect(certState(req('2026-06-29'), TODAY)).toBe('EXPIRING'); // 60 days
		expect(certState(req('2026-06-30'), TODAY)).toBe('VALID'); // 61 days
		expect(daysUntilExpiry('2026-06-29', TODAY)).toBe(CERT_EXPIRING_SOON_DAYS);
	});

	it('never blocks on any non-EXPIRED state', () => {
		for (const c of [notReq(null), notReq('2020-01-01'), req(null), req(TODAY), req('2027-01-01')]) {
			expect(isCertBlocked(c, TODAY)).toBe(false);
		}
	});
});

describe('daysUntilExpiry', () => {
	it('counts whole calendar days across a DST boundary', () => {
		// US DST starts 2026-03-08. A naive hour-based diff returns 0.958… here and
		// floors to 0, which would fire the "expires today" stage a day early.
		expect(daysUntilExpiry('2026-03-09', '2026-03-08')).toBe(1);
		expect(daysUntilExpiry('2026-03-08', '2026-03-07')).toBe(1);
	});

	it('is negative once lapsed and zero on the day', () => {
		expect(daysUntilExpiry('2026-04-29', TODAY)).toBe(-1);
		expect(daysUntilExpiry(TODAY, TODAY)).toBe(0);
	});
});
