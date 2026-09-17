import { describe, it, expect } from 'vitest';
import {
	decideAttribution,
	stripPlusAlias,
	normalizeEmail,
	type AttributionInput
} from '$lib/server/affiliate/attribution';

const FIRST_TOUCH = new Date('2026-06-01T10:00:00Z');

function input(overrides: Partial<AttributionInput> = {}): AttributionInput {
	return {
		cookieCode: 'ABCD2345',
		urlCode: null,
		firstTouchAt: FIRST_TOUCH,
		clickId: 99,
		hasInvite: false,
		affiliate: {
			id: 'aff_1',
			userId: 'user_affiliate',
			status: 'ACTIVE',
			contactEmail: 'school@example.edu',
			ownerEmail: 'owner@example.edu'
		},
		code: { id: 'code_1', active: true },
		alreadyAttributed: false,
		signupUserId: 'user_new',
		signupEmail: 'newbie@practice.com',
		signupRole: 'CLIENT',
		...overrides
	};
}

describe('decideAttribution — happy path', () => {
	it('creates a QUALIFIED referral from a valid cookie', () => {
		expect(decideAttribution(input())).toEqual({
			action: 'CREATE',
			affiliateId: 'aff_1',
			codeId: 'code_1',
			source: 'COOKIE',
			firstTouchAt: FIRST_TOUCH,
			clickId: 99,
			status: 'QUALIFIED'
		});
	});

	it('falls back to a URL code when there is no cookie', () => {
		const d = decideAttribution(input({ cookieCode: null, urlCode: 'WXYZ6789' }));
		expect(d).toMatchObject({ action: 'CREATE', source: 'URL' });
	});

	it('prefers the cookie (first touch) over a URL code on the same request', () => {
		const d = decideAttribution(input({ cookieCode: 'ABCD2345', urlCode: 'WXYZ6789' }));
		expect(d).toMatchObject({ action: 'CREATE', source: 'COOKIE' });
	});

	it('attributes a professional referring a practice — no same-type restriction', () => {
		const d = decideAttribution(input({ signupRole: 'CLIENT' }));
		expect(d.action).toBe('CREATE');
	});
});

describe('decideAttribution — permanence', () => {
	it('never overwrites an existing referral', () => {
		expect(decideAttribution(input({ alreadyAttributed: true }))).toEqual({
			action: 'SKIP',
			reason: 'ALREADY_ATTRIBUTED'
		});
	});

	it('skips when there is no code at all', () => {
		expect(decideAttribution(input({ cookieCode: null, urlCode: null }))).toEqual({
			action: 'SKIP',
			reason: 'NO_REFERRAL_CODE'
		});
	});

	it('skips an unknown code rather than inventing an affiliate', () => {
		expect(decideAttribution(input({ affiliate: null, code: null }))).toEqual({
			action: 'SKIP',
			reason: 'UNKNOWN_CODE'
		});
	});
});

describe('decideAttribution — invite precedence', () => {
	it('lets an explicit invite outrank a referral cookie', () => {
		const d = decideAttribution(input({ hasInvite: true }));
		expect(d).toEqual({
			action: 'REJECT',
			affiliateId: 'aff_1',
			codeId: 'code_1',
			reason: 'SUPERSEDED_BY_INVITE'
		});
	});

	it('records the loss as a REJECT row rather than silently discarding it', () => {
		// The distinction matters: support must be able to see why an affiliate
		// did not get credit.
		const d = decideAttribution(input({ hasInvite: true }));
		expect(d.action).not.toBe('SKIP');
	});
});

describe('decideAttribution — self-referral (hard rejects, identity equality only)', () => {
	it('rejects when the affiliate owner is the signing-up user', () => {
		const d = decideAttribution(input({ signupUserId: 'user_affiliate' }));
		expect(d).toMatchObject({ action: 'REJECT', reason: 'SELF_REFERRAL_SAME_USER' });
	});

	it("rejects when the signup email is the affiliate's owner email", () => {
		const d = decideAttribution(input({ signupEmail: 'owner@example.edu' }));
		expect(d).toMatchObject({ action: 'REJECT', reason: 'SELF_REFERRAL_SAME_EMAIL' });
	});

	it("rejects when the signup email is the affiliate's contact email", () => {
		const d = decideAttribution(input({ signupEmail: 'school@example.edu' }));
		expect(d).toMatchObject({ action: 'REJECT', reason: 'SELF_REFERRAL_SAME_EMAIL' });
	});

	it('matches emails case- and whitespace-insensitively', () => {
		const d = decideAttribution(input({ signupEmail: '  OWNER@Example.EDU ' }));
		expect(d).toMatchObject({ action: 'REJECT', reason: 'SELF_REFERRAL_SAME_EMAIL' });
	});
});

describe('decideAttribution — affiliate and code state', () => {
	it('rejects an inactive code', () => {
		const d = decideAttribution(input({ code: { id: 'code_1', active: false } }));
		expect(d).toMatchObject({ action: 'REJECT', reason: 'CODE_INACTIVE' });
	});

	for (const status of ['PENDING', 'ON_HOLD', 'DENIED'] as const) {
		it(`rejects a ${status} affiliate`, () => {
			const d = decideAttribution(input({ affiliate: { ...input().affiliate!, status } }));
			expect(d).toMatchObject({ action: 'REJECT', reason: `AFFILIATE_${status}` });
		});
	}
});

describe('decideAttribution — statistical signals flag, never reject', () => {
	it('flags a plus-alias of the affiliate email for review instead of rejecting', () => {
		const d = decideAttribution(input({ signupEmail: 'owner+new@example.edu' }));
		expect(d).toMatchObject({
			action: 'CREATE',
			status: 'PENDING',
			flaggedReason: 'EMAIL_PLUS_ALIAS_MATCH'
		});
	});

	it('does not flag an unrelated address at the same domain (shared institution)', () => {
		// Two students at one dental school must not be treated as fraud.
		const d = decideAttribution(input({ signupEmail: 'student@example.edu' }));
		expect(d).toMatchObject({ action: 'CREATE', status: 'QUALIFIED' });
		expect(d).not.toHaveProperty('flaggedReason');
	});
});

describe('stripPlusAlias', () => {
	it('strips a +tag', () => {
		expect(stripPlusAlias('a+tag@b.com')).toBe('a@b.com');
	});
	it('leaves a plain address alone', () => {
		expect(stripPlusAlias('a@b.com')).toBe('a@b.com');
	});
	it('ignores a + in the domain', () => {
		expect(stripPlusAlias('a@b+c.com')).toBe('a@b+c.com');
	});
	it('handles a malformed address without throwing', () => {
		expect(stripPlusAlias('notanemail')).toBe('notanemail');
	});
});

describe('normalizeEmail', () => {
	it('lowercases and trims', () => {
		expect(normalizeEmail('  A@B.COM ')).toBe('a@b.com');
	});
});
