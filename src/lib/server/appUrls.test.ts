import { describe, expect, it } from 'vitest';
import { trimTrailingSlash } from './appUrls';

describe('trimTrailingSlash', () => {
	it.each([
		['https://internal.dtstaffingsolutions.com/', 'https://internal.dtstaffingsolutions.com'],
		['https://internal.dtstaffingsolutions.com//', 'https://internal.dtstaffingsolutions.com'],
		[' https://app.dtstaffingsolutions.com ', 'https://app.dtstaffingsolutions.com'],
		['https://app.dtstaffingsolutions.com', 'https://app.dtstaffingsolutions.com'],
		[undefined, '']
	])('%s → %s', (input, expected) => {
		expect(trimTrailingSlash(input)).toBe(expected);
	});
});
