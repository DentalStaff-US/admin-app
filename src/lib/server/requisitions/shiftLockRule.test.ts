import { describe, it, expect } from 'vitest';
import {
	hasShiftStarted,
	isTimesheetPaidOut,
	shiftLockReason,
	shiftLockedMessage,
	shiftLockedErrorMessage,
	ShiftLockedError
} from '$lib/server/requisitions/shiftLockRule';

const now = new Date('2026-10-27T15:00:00Z');
const past = new Date('2026-10-27T13:00:00Z');
const future = new Date('2026-10-28T13:00:00Z');

describe('hasShiftStarted', () => {
	it('is true once the start has passed, including the exact instant', () => {
		expect(hasShiftStarted(past, now)).toBe(true);
		expect(hasShiftStarted(now, now)).toBe(true);
	});

	it('is false for a future shift', () => {
		expect(hasShiftStarted(future, now)).toBe(false);
	});

	it('accepts ISO strings', () => {
		expect(hasShiftStarted(past.toISOString(), now)).toBe(true);
	});

	it('is false for a missing or unparseable start', () => {
		expect(hasShiftStarted(null, now)).toBe(false);
		expect(hasShiftStarted('not a date', now)).toBe(false);
	});
});

describe('isTimesheetPaidOut', () => {
	it('is true only for an approved sheet with wages paid', () => {
		expect(isTimesheetPaidOut({ status: 'APPROVED', wagesStatus: 'WAGES_PAID' })).toBe(true);
		expect(isTimesheetPaidOut({ status: 'APPROVED', wagesStatus: 'WAGES_DUE' })).toBe(false);
		expect(isTimesheetPaidOut({ status: 'APPROVED', wagesStatus: null })).toBe(false);
		expect(isTimesheetPaidOut({ status: 'DRAFT', wagesStatus: 'WAGES_PAID' })).toBe(false);
		expect(isTimesheetPaidOut({})).toBe(false);
	});
});

describe('shiftLockReason', () => {
	const paid = { timesheetStatus: 'APPROVED', wagesStatus: 'WAGES_PAID' };

	it('locks a started shift on an approved, paid timesheet', () => {
		// The prod incident: a paid past shift was deleted.
		expect(shiftLockReason({ dayStart: past, ...paid }, now)).toBe('PAID');
	});

	it('locks a started shift whose timesheet has a live invoice', () => {
		expect(
			shiftLockReason(
				{ dayStart: past, timesheetStatus: 'APPROVED', wagesStatus: 'WAGES_DUE', invoiced: true },
				now
			)
		).toBe('INVOICED');
	});

	it('reports PAID when a shift is both paid and invoiced', () => {
		expect(shiftLockReason({ dayStart: past, ...paid, invoiced: true }, now)).toBe('PAID');
	});

	it('leaves a started shift open until it is paid or invoiced', () => {
		expect(shiftLockReason({ dayStart: past, timesheetStatus: null }, now)).toBeNull();
		expect(shiftLockReason({ dayStart: past, timesheetStatus: 'PENDING' }, now)).toBeNull();
		expect(
			shiftLockReason({ dayStart: past, timesheetStatus: 'APPROVED', wagesStatus: 'WAGES_DUE' }, now)
		).toBeNull();
	});

	it('never locks a shift that has not started', () => {
		expect(shiftLockReason({ dayStart: future, ...paid, invoiced: true }, now)).toBeNull();
	});
});

describe('shiftLockedMessage', () => {
	it('names the dates and the attempted action', () => {
		expect(shiftLockedMessage(['2026-10-01'], 'deleted')).toBe(
			"This shift has been worked, approved and paid (2026-10-01) and can't be deleted — it's the record of what happened."
		);
		expect(shiftLockedMessage(['2026-10-01', '2026-10-02'], 'cancelled')).toMatch(/^These shifts have/);
	});

	it('points invoiced shifts at Void Timesheet & Invoice', () => {
		expect(shiftLockedMessage(['2026-10-01'], 'cancelled', 'INVOICED')).toBe(
			'This shift is on an invoice (2026-10-01) and can\'t be cancelled directly — use "Void Timesheet & Invoice" on the timesheet first, then correct the shift.'
		);
	});
});

describe('shiftLockedErrorMessage', () => {
	it('surfaces only ShiftLockedError messages', () => {
		expect(shiftLockedErrorMessage(new ShiftLockedError('locked'))).toBe('locked');
		expect(shiftLockedErrorMessage(new Error('other'))).toBeNull();
	});
});
