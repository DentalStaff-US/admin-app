import { describe, it, expect } from 'vitest';
import {
	checkAccountUsable,
	checkRoleAllowed,
	type AccountStatusFields
} from '$lib/server/accountStatus';

const NOW = new Date('2026-08-18T12:00:00Z');

const clean: AccountStatusFields = { blacklisted: false, banned: false, banExpires: null };

describe('checkAccountUsable', () => {
	it('allows a clean account', () => {
		expect(checkAccountUsable(clean, NOW)).toEqual({ ok: true });
	});

	it('allows an account whose flags are null (never set)', () => {
		expect(
			checkAccountUsable({ blacklisted: null, banned: null, banExpires: null }, NOW)
		).toEqual({ ok: true });
	});

	it('rejects a blacklisted account with 403', () => {
		const result = checkAccountUsable({ ...clean, blacklisted: true }, NOW);
		expect(result).toEqual({ ok: false, status: 403, message: 'Account suspended' });
	});

	it('rejects a permanently banned account (no expiry)', () => {
		const result = checkAccountUsable({ ...clean, banned: true, banExpires: null }, NOW);
		expect(result.ok).toBe(false);
	});

	it('rejects a banned account whose ban has not yet expired', () => {
		const result = checkAccountUsable(
			{ ...clean, banned: true, banExpires: new Date('2026-08-19T00:00:00Z') },
			NOW
		);
		expect(result.ok).toBe(false);
	});

	it('allows a banned account whose ban has lapsed', () => {
		const result = checkAccountUsable(
			{ ...clean, banned: true, banExpires: new Date('2026-08-17T00:00:00Z') },
			NOW
		);
		expect(result).toEqual({ ok: true });
	});

	it('treats an expiry exactly equal to now as lapsed', () => {
		const result = checkAccountUsable({ ...clean, banned: true, banExpires: NOW }, NOW);
		expect(result).toEqual({ ok: true });
	});

	it('blacklist wins even when the ban has lapsed', () => {
		const result = checkAccountUsable(
			{ blacklisted: true, banned: true, banExpires: new Date('2020-01-01T00:00:00Z') },
			NOW
		);
		expect(result.ok).toBe(false);
	});
});

describe('checkRoleAllowed', () => {
	it('allows any role when no allowlist is given — the pre-existing call-site behaviour', () => {
		expect(checkRoleAllowed('CANDIDATE')).toEqual({ ok: true });
		expect(checkRoleAllowed(null)).toEqual({ ok: true });
		expect(checkRoleAllowed(undefined)).toEqual({ ok: true });
	});

	it('treats an empty allowlist as "any role"', () => {
		expect(checkRoleAllowed('CANDIDATE', [])).toEqual({ ok: true });
	});

	it('allows a role that is on the list', () => {
		expect(checkRoleAllowed('CANDIDATE', ['CANDIDATE', 'CLIENT'])).toEqual({ ok: true });
	});

	it('rejects a role that is not on the list with 403', () => {
		expect(checkRoleAllowed('CANDIDATE', ['SUPERADMIN'])).toEqual({
			ok: false,
			status: 403,
			message: 'Insufficient permissions'
		});
	});

	it('rejects a null role when an allowlist is given', () => {
		expect(checkRoleAllowed(null, ['CANDIDATE']).ok).toBe(false);
	});

	it('is case-sensitive — role strings are exact', () => {
		expect(checkRoleAllowed('candidate', ['CANDIDATE']).ok).toBe(false);
	});
});
