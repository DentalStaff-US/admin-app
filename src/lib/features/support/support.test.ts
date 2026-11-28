import { describe, expect, it } from 'vitest';
import { fullName, initials, pageOf, sortThread, supportRoleLabel, timeAgo } from './support';

const now = new Date('2026-11-10T12:00:00Z');

describe('timeAgo', () => {
	it('uses the same buckets as before', () => {
		expect(timeAgo(new Date('2026-11-10T11:59:40Z'), now)).toBe('Just now');
		expect(timeAgo(new Date('2026-11-10T11:55:00Z'), now)).toBe('5 minutes ago');
		expect(timeAgo(new Date('2026-11-10T11:00:00Z'), now)).toBe('1 hour ago');
		expect(timeAgo('2026-11-08T12:00:00Z', now)).toBe('2 days ago');
	});
});

describe('supportRoleLabel', () => {
	it('says who someone is in plain words', () => {
		expect(supportRoleLabel('SUPERADMIN')).toBe('DTSS team');
		expect(supportRoleLabel('CLIENT_STAFF')).toBe('Practice staff');
		expect(supportRoleLabel('SOMETHING_NEW')).toBe('Something new');
		expect(supportRoleLabel(null)).toBe('');
	});
});

describe('names', () => {
	it('falls back when parts are missing', () => {
		expect(initials({ firstName: 'maria', lastName: 'lopez' })).toBe('ML');
		expect(initials(null)).toBe('?');
		expect(fullName({ firstName: 'Maria', lastName: null })).toBe('Maria');
		expect(fullName(undefined)).toBe('Unknown');
	});
});

describe('sortThread and pageOf', () => {
	it('orders the thread oldest first without mutating', () => {
		const input = [{ comment: { createdAt: '2026-11-10' } }, { comment: { createdAt: '2026-11-01' } }];
		expect(sortThread(input).map((c) => c.comment.createdAt)).toEqual(['2026-11-01', '2026-11-10']);
		expect(input[0].comment.createdAt).toBe('2026-11-10');
	});

	it('slices one page', () => {
		const rows = Array.from({ length: 25 }, (_, i) => i);
		expect(pageOf(rows, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		expect(pageOf(rows, 3, 10)).toEqual([20, 21, 22, 23, 24]);
		expect(pageOf(rows, 0, 10)).toHaveLength(10);
	});
});
