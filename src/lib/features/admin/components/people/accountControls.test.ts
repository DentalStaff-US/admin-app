import { describe, expect, it } from 'vitest';
import {
	anonymizedEmail,
	deleteBlockers,
	EMPTY_COUNTS,
	isAnonymized,
	roleSwitchBlockers,
	roleSwitchTarget,
	signInMethodsLabel,
	switchRemovals
} from './accountControls';

const counts = (over: Partial<typeof EMPTY_COUNTS>) => ({ ...EMPTY_COUNTS, ...over });

describe('roleSwitchTarget', () => {
	it('swaps practice owner and professional', () => {
		expect(roleSwitchTarget('CLIENT')).toBe('CANDIDATE');
		expect(roleSwitchTarget('CANDIDATE')).toBe('CLIENT');
	});
	it('has no switch for staff, admins or unknown roles', () => {
		for (const role of ['CLIENT_STAFF', 'ADMIN', 'SUPERADMIN', null, undefined]) {
			expect(roleSwitchTarget(role)).toBeNull();
		}
	});
});

describe('roleSwitchBlockers', () => {
	it('lets a clean mistaken signup switch', () => {
		expect(roleSwitchBlockers('CLIENT', counts({ companies: 1, locations: 2, clientDocuments: 3, conversations: 1 }))).toEqual([]);
		expect(roleSwitchBlockers('CANDIDATE', counts({ candidateDocuments: 4 }))).toEqual([]);
	});
	it('blocks a practice with business records or staff', () => {
		expect(roleSwitchBlockers('CLIENT', counts({ requisitions: 2, invoices: 1, staffMembers: 1 }))).toEqual([
			'2 requisitions',
			'1 invoice',
			'1 staff account'
		]);
	});
	it('blocks a professional with shifts, timesheets or applications', () => {
		expect(roleSwitchBlockers('CANDIDATE', counts({ workdays: 1, applications: 3 }))).toEqual(['1 shift', '3 applications']);
	});
	it('only counts the profile being removed: partner records and the other side never block', () => {
		expect(roleSwitchBlockers('CLIENT', counts({ payouts: 2, workdays: 5 }))).toEqual([]);
	});
	it('refuses roles that do not switch', () => {
		expect(roleSwitchBlockers('CLIENT_STAFF', EMPTY_COUNTS)).toHaveLength(1);
	});
});

describe('deleteBlockers', () => {
	it('counts records of business on every profile, including partner payouts', () => {
		expect(deleteBlockers(counts({ clientTimesheets: 1, candidateTimesheets: 2, commissions: 1 }))).toEqual([
			'1 timesheet',
			'2 timesheets',
			'1 partner commission'
		]);
	});
	it('ignores data that is removed with the account', () => {
		expect(deleteBlockers(counts({ companies: 1, messagesSent: 9, activeSessions: 2 }))).toEqual([]);
	});
});

describe('switchRemovals', () => {
	it('names the profile and what goes with it', () => {
		expect(switchRemovals('CLIENT', counts({ companies: 1, locations: 2, conversations: 1 }))).toEqual([
			'their practice profile',
			'1 practice',
			'2 locations',
			'1 conversation'
		]);
		expect(switchRemovals('CANDIDATE', counts({ candidateDocuments: 1 }))).toEqual(['their professional profile', '1 document']);
	});
});

describe('anonymized accounts', () => {
	it('round-trips the placeholder email', () => {
		expect(isAnonymized(anonymizedEmail('abc'))).toBe(true);
		expect(isAnonymized('someone@example.com')).toBe(false);
		expect(isAnonymized(null)).toBe(false);
	});
});

describe('signInMethodsLabel', () => {
	it('labels known providers and passes others through', () => {
		expect(signInMethodsLabel(['credential', 'google', 'github'])).toBe('Password, Google, github');
		expect(signInMethodsLabel([])).toBe('None (email code only)');
	});
});
