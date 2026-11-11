import { describe, expect, it } from 'vitest';
import { likePattern } from './commandSearch';

describe('likePattern', () => {
	it('wraps the query and escapes LIKE wildcards', () => {
		expect(likePattern('smith')).toBe('%smith%');
		expect(likePattern('50%_off')).toBe('%50\\%\\_off%');
		expect(likePattern('a\\b')).toBe('%a\\\\b%');
	});
});
