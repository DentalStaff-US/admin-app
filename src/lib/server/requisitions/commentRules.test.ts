import { describe, expect, it } from 'vitest';
import { pickCommentRecipients, resolveCommentInternal } from './commentRules';

describe('resolveCommentInternal', () => {
	it('honours the flag for SUPERADMIN', () => {
		expect(resolveCommentInternal('SUPERADMIN', 'true')).toBe(true);
		expect(resolveCommentInternal('SUPERADMIN', null)).toBe(false);
	});

	it('forces false for client roles even when they send the flag', () => {
		expect(resolveCommentInternal('CLIENT', 'true')).toBe(false);
		expect(resolveCommentInternal('CLIENT_STAFF', 'true')).toBe(false);
		expect(resolveCommentInternal(undefined, 'true')).toBe(false);
	});
});

describe('pickCommentRecipients', () => {
	const base = {
		internal: false,
		authorId: 'admin-1',
		authorIsAdmin: true,
		owner: { userId: 'owner-1', email: 'Owner@Practice.com' },
		clientCommenters: [
			{ userId: 'staff-1', email: 'staff@practice.com' },
			{ userId: 'owner-1', email: 'owner@practice.com' }
		],
		adminEmails: ['ops@dtss.com', 'boss@dtss.com']
	};

	it('never emails anyone about an internal note', () => {
		expect(pickCommentRecipients({ ...base, internal: true })).toEqual([]);
		expect(pickCommentRecipients({ ...base, internal: true, authorIsAdmin: false })).toEqual([]);
	});

	it('admin comment goes to the client owner and client commenters, de-duplicated', () => {
		expect(pickCommentRecipients(base)).toEqual(['owner@practice.com', 'staff@practice.com']);
	});

	it('client comment goes to admins only', () => {
		expect(pickCommentRecipients({ ...base, authorIsAdmin: false, authorId: 'staff-1' })).toEqual([
			'ops@dtss.com',
			'boss@dtss.com'
		]);
	});

	it('never emails the author their own comment', () => {
		// An admin who is somehow also the owner (or a prior commenter) is skipped.
		expect(pickCommentRecipients({ ...base, authorId: 'owner-1' })).toEqual(['staff@practice.com']);
	});

	it('drops missing addresses', () => {
		expect(
			pickCommentRecipients({
				...base,
				owner: { userId: 'owner-1', email: null },
				clientCommenters: []
			})
		).toEqual([]);
		expect(pickCommentRecipients({ ...base, authorIsAdmin: false, adminEmails: [null] })).toEqual(
			[]
		);
	});
});
