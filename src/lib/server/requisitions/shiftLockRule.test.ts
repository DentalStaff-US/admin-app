import { describe, it, expect } from 'vitest';
import {
	canEditShift,
	isShiftLocked,
	shiftLockedErrorMessage,
	ShiftLockedError
} from '$lib/server/requisitions/shiftLockRule';

const now = new Date('2026-10-27T15:00:00Z');
const past = new Date('2026-10-27T13:00:00Z');
const future = new Date('2026-10-28T13:00:00Z');

describe('isShiftLocked', () => {
	it('locks a shift whose start has passed', () => {
		expect(isShiftLocked(past, now)).toBe(true);
	});

	it('locks at the exact start instant', () => {
		expect(isShiftLocked(now, now)).toBe(true);
	});

	it('leaves a future shift unlocked', () => {
		expect(isShiftLocked(future, now)).toBe(false);
	});

	it('accepts ISO strings', () => {
		expect(isShiftLocked(past.toISOString(), now)).toBe(true);
	});

	it('never locks a missing or unparseable start', () => {
		expect(isShiftLocked(null, now)).toBe(false);
		expect(isShiftLocked('not a date', now)).toBe(false);
	});
});

describe('canEditShift', () => {
	it('always allows editing a future shift', () => {
		expect(canEditShift({ dayStart: future, timesheetStatus: 'APPROVED' }, now)).toBe(true);
	});

	it('allows correcting a past shift while its timesheet is still open', () => {
		expect(canEditShift({ dayStart: past, timesheetStatus: 'DRAFT' }, now)).toBe(true);
		expect(canEditShift({ dayStart: past, timesheetStatus: 'PENDING' }, now)).toBe(true);
		expect(canEditShift({ dayStart: past, timesheetStatus: null }, now)).toBe(true);
	});

	it('blocks editing a past shift on a settled timesheet', () => {
		expect(canEditShift({ dayStart: past, timesheetStatus: 'APPROVED' }, now)).toBe(false);
		expect(canEditShift({ dayStart: past, timesheetStatus: 'VOID' }, now)).toBe(false);
	});

	it('blocks editing a past shift once invoiced or wages are paid', () => {
		// The prod incident: paid out, but the sheet status alone would have allowed it.
		expect(canEditShift({ dayStart: past, timesheetStatus: 'PENDING', invoiced: true }, now)).toBe(
			false
		);
		expect(
			canEditShift({ dayStart: past, timesheetStatus: 'DRAFT', wagesStatus: 'WAGES_PAID' }, now)
		).toBe(false);
	});
});

describe('shiftLockedErrorMessage', () => {
	it('surfaces only ShiftLockedError messages', () => {
		expect(shiftLockedErrorMessage(new ShiftLockedError('locked'))).toBe('locked');
		expect(shiftLockedErrorMessage(new Error('other'))).toBeNull();
	});
});
