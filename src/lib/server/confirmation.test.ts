import { describe, expect, it } from 'vitest';
import { hasTypedConfirmation } from './confirmation';

const form = (value?: string) => {
	const f = new FormData();
	if (value !== undefined) f.set('confirm', value);
	return f;
};

describe('hasTypedConfirmation', () => {
	it('accepts the exact word, ignoring surrounding spaces', () => {
		expect(hasTypedConfirmation(form('DELETE'))).toBe(true);
		expect(hasTypedConfirmation(form('  DELETE '))).toBe(true);
	});

	it('refuses anything else, including a missing field and other casing', () => {
		expect(hasTypedConfirmation(form())).toBe(false);
		expect(hasTypedConfirmation(form(''))).toBe(false);
		expect(hasTypedConfirmation(form('delete'))).toBe(false);
		expect(hasTypedConfirmation(form('DELETE IT'))).toBe(false);
	});

	it('supports another word', () => {
		expect(hasTypedConfirmation(form('ARCHIVE'), 'ARCHIVE')).toBe(true);
	});
});
