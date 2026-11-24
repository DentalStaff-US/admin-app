import { describe, expect, it } from 'vitest';
import { conversationLogBack, conversationLogUrl, likePattern, readConversationLogFilters } from './conversationLog';

describe('conversation log filters', () => {
	it('round-trips through the URL', () => {
		const url = conversationLogUrl({ search: 'off platform', between: 'PRACTICE_PRO' }, 3);
		expect(url).toBe('/admin/menu/conversations?search=off+platform&between=PRACTICE_PRO&page=3');
		expect(readConversationLogFilters(new URL(`http://x${url}`).searchParams)).toEqual({ search: 'off platform', between: 'PRACTICE_PRO' });
	});
	it('drops blanks and unknown values', () => {
		expect(conversationLogUrl({ search: '  ', between: '' })).toBe('/admin/menu/conversations');
		expect(readConversationLogFilters(new URLSearchParams('between=ADMIN')).between).toBe('');
	});
});

describe('conversationLogBack', () => {
	it('only goes back into the log', () => {
		expect(conversationLogBack('/admin/menu/conversations?page=2')).toBe('/admin/menu/conversations?page=2');
		for (const bad of [null, 'https://evil.test', '//evil.test', '/admin/menu/conversationsevil']) {
			expect(conversationLogBack(bad)).toBe('/admin/menu/conversations');
		}
	});
});

describe('likePattern', () => {
	it('escapes wildcards', () => {
		expect(likePattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
	});
});
