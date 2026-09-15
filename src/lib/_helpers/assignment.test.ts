import { describe, it, expect } from 'vitest';
import { isAssignmentActive, isAssignmentHistory, shouldShowProfessional } from './assignment';

const live = { cancelledAt: null };
const cancelled = { cancelledAt: new Date('2026-09-04T23:42:46Z') };

describe('isAssignmentActive', () => {
	it('is true only while the workday is uncancelled', () => {
		expect(isAssignmentActive(live)).toBe(true);
		expect(isAssignmentActive(cancelled)).toBe(false);
	});

	it('treats a missing workday row as unassigned', () => {
		expect(isAssignmentActive(null)).toBe(false);
		expect(isAssignmentActive(undefined)).toBe(false);
	});
});

describe('isAssignmentHistory', () => {
	it('shows a cancelled assignment on a cancelled day', () => {
		expect(isAssignmentHistory(cancelled, 'CANCELED')).toBe(true);
	});

	it('does NOT show it on a day that was reopened', () => {
		// The blacklist flow soft-cancels the workday and flips the day back to
		// OPEN. Treating that as an assignment is the bug this rule exists for.
		expect(isAssignmentHistory(cancelled, 'OPEN')).toBe(false);
		expect(isAssignmentHistory(cancelled, 'UNFULFILLED')).toBe(false);
	});

	it('is not history while the assignment is still live', () => {
		expect(isAssignmentHistory(live, 'CANCELED')).toBe(false);
	});
});

describe('shouldShowProfessional', () => {
	it('shows a live assignment whatever the day status', () => {
		expect(shouldShowProfessional(live, 'FILLED')).toBe(true);
		expect(shouldShowProfessional(live, 'OPEN')).toBe(true);
	});

	it('hides a cancelled assignment on a reopened day — the prod regression', () => {
		expect(shouldShowProfessional(cancelled, 'OPEN')).toBe(false);
	});

	it('keeps a cancelled assignment visible on a cancelled day', () => {
		expect(shouldShowProfessional(cancelled, 'CANCELED')).toBe(true);
	});

	it('shows nothing when there is no workday row', () => {
		expect(shouldShowProfessional(null, 'OPEN')).toBe(false);
		expect(shouldShowProfessional(null, 'CANCELED')).toBe(false);
	});
});
